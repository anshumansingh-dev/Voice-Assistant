// src/ws.ts
import WebSocket, { WebSocketServer } from "ws";
import { streamAnswer } from "./llm.js";
import { streamTextToSpeech } from "./tts.js";

const SONIOX_WS_URL = "wss://stt-rt.soniox.com/transcribe-websocket";
const SONIOX_API_KEY = process.env.SONIOX_API_KEY!;

// High-resolution timer (seconds)
const now = () => Number(process.hrtime.bigint()) / 1e9;

export function setupWebSocket(server: any) {
  const wss = new WebSocketServer({ server });

  wss.on("connection", (clientWs) => {
    console.log("🔌 [CLIENT] Connected");

    let cancelled = false;
    let processing = false;
    let sonioxWs: WebSocket | null = null;
    let pendingAudio: Buffer | null = null;

    let tTurnStart = 0;
    let tSTTStart = 0;
    let tLLMStart = 0;

    /* ================= SONIOX ================= */

    function connectSoniox() {
      console.log("🎙 [SONIOX] Connecting...");
      sonioxWs = new WebSocket(SONIOX_WS_URL);

      sonioxWs.on("open", () => {
        console.log("✅ [SONIOX] Connected");

        sonioxWs!.send(
          JSON.stringify({
            api_key: SONIOX_API_KEY,
            model: "stt-rt-preview",
            audio_format: "auto",
            language_hints: ["en"],
            enable_endpoint_detection: true,
          })
        );

        if (pendingAudio) {
          tTurnStart = now();
          tSTTStart = now();

          console.log("➡️ [SONIOX] Sending buffered audio");
          sonioxWs!.send(pendingAudio);
          sonioxWs!.send("");
          pendingAudio = null;
        }
      });

      sonioxWs.on("message", handleSonioxMessage);

      sonioxWs.on("error", (e) =>
        console.error("❌ [SONIOX] WS error:", e)
      );

      sonioxWs.on("close", (code) =>
        console.log(`❌ [SONIOX] WS closed (code=${code})`)
      );
    }

    async function handleSonioxMessage(msg: WebSocket.RawData) {
      let data: any;
      try {
        data = JSON.parse(msg.toString());
      } catch {
        return;
      }

      if (data.error_code) {
        console.error("❌ [SONIOX] ERROR:", data.error_message);
        return;
      }

      if (data.finished) {
        console.log(
          `🏁 [SONIOX] Finished | STT latency = ${(now() - tSTTStart).toFixed(
            2
          )}s`
        );
        return;
      }

      if (!Array.isArray(data.tokens)) return;
      if (processing || cancelled) return;

      const finalTokens = data.tokens.filter(
        (t: any) => t.is_final && t.text
      );
      if (!finalTokens.length) return;

      const text = finalTokens.map((t: any) => t.text).join(" ").trim();
      if (!text) return;

      console.log(
        `🧠 [SONIOX] FINAL (${(now() - tSTTStart).toFixed(2)}s):`,
        text
      );

      processing = true;
      cancelled = false;

      try {
        /* ================= LLM ================= */

        tLLMStart = now();
        console.log("🤖 [LLM] Streaming started");

        const llmStream = await streamAnswer(text);
        let firstToken = true;

        for await (const chunk of llmStream) {
          if (cancelled) return;

          if ("content" in chunk && typeof chunk.content === "string") {
            if (firstToken) {
              console.log(
                `⚡ [LLM] First token latency = ${(now() - tLLMStart).toFixed(
                  2
                )}s`
              );
              firstToken = false;
            }

            /* ================= TTS STREAM ================= */

            for await (const audioChunk of streamTextToSpeech(chunk.content)) {
              clientWs.send(audioChunk);
            }
          }
        }

        console.log(
          `✅ [PIPELINE] Turn complete | total = ${(now() - tTurnStart).toFixed(
            2
          )}s`
        );
      } catch (err) {
        console.error("❌ [PIPELINE] Error:", err);
      } finally {
        processing = false;
      }
    }

    /* ================= BROWSER AUDIO ================= */

    clientWs.on("message", (data) => {
      if (typeof data === "string") {
        try {
          const msg = JSON.parse(data);
          if (msg.type === "INTERRUPT") {
            console.log("🛑 [CLIENT] INTERRUPT");
            cancelled = true;
            processing = false;
          }
        } catch {}
        return;
      }

      if (!(data instanceof Buffer)) return;
      if (data.length < 12000) return;

      console.log(`🎧 [AUDIO] Blob received (${data.length} bytes)`);

      if (!sonioxWs || sonioxWs.readyState !== WebSocket.OPEN) {
        pendingAudio = data;
        connectSoniox();
        return;
      }

      tTurnStart = now();
      tSTTStart = now();

      sonioxWs.send(data);
      sonioxWs.send("");
    });

    clientWs.on("close", () => {
      console.log("❌ [CLIENT] Disconnected");
      cancelled = true;

      if (sonioxWs && sonioxWs.readyState === WebSocket.OPEN) {
        sonioxWs.send("");
        sonioxWs.close();
      }
    });
  });
}
