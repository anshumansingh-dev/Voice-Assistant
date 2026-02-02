import WebSocket, { WebSocketServer } from "ws";
import { speechToText } from "./stt.js";
import { streamAnswer } from "./llm.js";
import { textToSpeech } from "./tts.js";

/* --------------------
   High-resolution timer
-------------------- */
const now = () => Number(process.hrtime.bigint() / 1_000_000n); // ms

export function setupWebSocket(server: any) {
  const wss = new WebSocketServer({ server });

  wss.on("connection", (ws) => {
    console.log(`[${new Date().toISOString()}] 🔌 Client connected`);

    let processing = false;
    let lastTTSAt = 0;
    let cancelled = false;

    ws.on("message", async (data) => {
      /* ---------- INTERRUPT ---------- */
      if (typeof data === "string") {
        try {
          const msg = JSON.parse(data);
          if (msg.type === "INTERRUPT") {
            console.log("🛑 INTERRUPT received");
            cancelled = true;
            processing = false;
            return;
          }
        } catch {}
      }

      /* ---------- GUARDS ---------- */
      if (processing) return;
      if (Date.now() - lastTTSAt < 1200) return;
      if (!(data instanceof Buffer) || data.byteLength < 8000) return;

      processing = true;
      cancelled = false;

      const tRequest = now();
      console.log(
        `[${new Date().toISOString()}] 📥 Server received audio | size=${data.byteLength}`
      );

      try {
        /* ================= STT ================= */

        const tSTTStart = now();
        console.log("🧠 STT started");

        let text = "";

        try {
          text = await speechToText(data);
        } catch (err: any) {
          if (err?.code === "STT_TRANSCRIPTION_FAILED") {
            console.log("🔇 STT: no speech detected (expected)");
            return; // <-- silently ignore
          }

          // real errors only
          throw err;
        }

        console.log(
          `🧠 STT finished | ${now() - tSTTStart}ms | text="${text}"`
        );

        if (!text?.trim()) return;

        if (!text || !text.trim()) {
          console.log("🔇 Empty transcript — ignoring");
          return;
        }

        /* ================= LLM STREAM ================= */

        const tLLMStart = now();
        console.log("🤖 LLM streaming started");

        const stream = await streamAnswer(text);

        let buffer = "";
        let firstTokenSeen = false;

        for await (const chunk of stream) {
          if (cancelled) {
            console.log("🛑 LLM stream cancelled");
            return;
          }

          if ("content" in chunk && typeof chunk.content === "string") {
            if (!firstTokenSeen) {
              console.log(
                `⚡ LLM first token | ${now() - tLLMStart}ms`
              );
              firstTokenSeen = true;
            }

            buffer += chunk.content;

            if (/[.?!]\s*$/.test(buffer)) {
              await speak(buffer.trim());
              buffer = "";
            }
          }
        }

        if (!cancelled && buffer.trim()) {
          await speak(buffer.trim());
        }

        console.log(`✅ TURN COMPLETE | total=${now() - tRequest}ms`);
      } catch (err) {
        console.error("❌ WS error:", err);
      } finally {
        processing = false;
      }

      async function speak(text: string) {
        if (cancelled) return;

        console.log("🔊 Speaking:", text);
        const tTTSStart = now();

        const audio = await textToSpeech(text);

        console.log(
          `🔊 TTS finished | ${now() - tTTSStart}ms | audioSize=${audio.length}`
        );

        ws.send(audio);
        lastTTSAt = Date.now();
      }
    });

    ws.on("close", () => {
      console.log("❌ Client disconnected");
      cancelled = true;
    });
  });
}
