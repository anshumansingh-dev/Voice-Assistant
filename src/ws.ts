import WebSocket, { WebSocketServer } from "ws";
import { streamAnswer } from "./llm.js";
import { CartesiaStream } from "./tts.js";

const SONIOX_URL = "wss://stt-rt.soniox.com/transcribe-websocket";
const SONIOX_API_KEY = process.env.SONIOX_API_KEY!;

type State = "IDLE" | "THINKING" | "SPEAKING";

const now = () => Number(process.hrtime.bigint()) / 1e6; // ms

export function setupWebSocket(server: any) {
  const wss = new WebSocketServer({ server });

  wss.on("connection", (clientWs) => {
    console.log("🔌 CLIENT CONNECTED");

    let sonioxWs: WebSocket | null = null;
    let keepAliveTimer: NodeJS.Timeout | null = null;

    let state: State = "IDLE";
    let transcriptBuffer = "";
    let activeTTS: CartesiaStream | null = null;

    let conversation: { role: "user" | "assistant"; content: string }[] = [];

    let currentTurnId = 0;
    let userSpeaking = false;
    let interruptLock = false;

    /* ================= SONIOX ================= */

    function connectSoniox() {
      sonioxWs = new WebSocket(SONIOX_URL);

      sonioxWs.on("open", () => {
        console.log("🎙 SONIOX CONNECTED");

        sonioxWs!.send(
          JSON.stringify({
            api_key: SONIOX_API_KEY,
            model: "stt-rt-preview",
            audio_format: "auto",
            language_hints: ["en"],
            enable_endpoint_detection: true,
          })
        );

        startKeepAlive();
      });

      sonioxWs.on("message", handleSonioxMessage);

      sonioxWs.on("close", () => {
        stopKeepAlive();
        setTimeout(connectSoniox, 500);
      });

      sonioxWs.on("error", () => {});
    }

    function startKeepAlive() {
      keepAliveTimer = setInterval(() => {
        if (sonioxWs?.readyState === WebSocket.OPEN) {
          sonioxWs.send(JSON.stringify({ type: "keepalive" }));
        }
      }, 8000);
    }

    function stopKeepAlive() {
      if (keepAliveTimer) clearInterval(keepAliveTimer);
    }

    /* ================= INTERRUPTION ================= */

    function interrupt() {
      currentTurnId++; // invalidate all previous streams
      state = "IDLE";

      if (activeTTS) {
        console.log("✂️ INTERRUPT → Cutting TTS immediately");
        try {
          activeTTS.removeAllListeners();
          activeTTS.close();
        } catch {}
        activeTTS = null;
      }

      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ type: "NEW_TURN" }));
      }
    }

    /* ================= STT HANDLER ================= */

    async function handleSonioxMessage(msg: WebSocket.RawData) {
      let data: any;
      try {
        data = JSON.parse(msg.toString());
      } catch {
        return;
      }

      if (!Array.isArray(data.tokens)) return;

      const tokens = data.tokens;
      const finals = tokens.filter((t: any) => t.is_final && t.text);
      const partials = tokens.filter((t: any) => !t.is_final && t.text);

      /* ---- HARD INTERRUPT ON USER SPEECH ---- */

      if (partials.length > 0) {
        if (!userSpeaking) {
          userSpeaking = true;

          if (state === "SPEAKING" && !interruptLock) {
            interruptLock = true;
            console.log("🎤 USER STARTED SPEAKING → HARD CUT");
            interrupt();
          }
        }
      }

      if (!finals.length) return;

      const text = finals.map((t: any) => t.text).join(" ");
      transcriptBuffer += " " + text;

      const hasEnd = finals.some((t: any) => t.text === "<end>");
      if (!hasEnd) return;

      const finalText = transcriptBuffer.replace("<end>", "").trim();
      transcriptBuffer = "";

      userSpeaking = false;
      interruptLock = false;

      if (!finalText) return;

      console.log("🧠 STT FINAL RECEIVED →", finalText);

      await processTurn(finalText);
    }

    /* ================= TURN PROCESSOR ================= */

    async function processTurn(userText: string) {
      interrupt(); // invalidate previous turn

      const myTurn = currentTurnId;

      const tSttEnd = now();
      console.log("\n⏱️ === LATENCY TRACKING START ===");
      console.log(`📍 STT finished at: ${tSttEnd.toFixed(2)} ms`);

      state = "THINKING";
      conversation.push({ role: "user", content: userText });

      console.log("🤖 LLM STREAM START");

      const tLlmStart = now();
      console.log(`📍 LLM request started at: ${tLlmStart.toFixed(2)} ms`);
      console.log(`⏱️ STT → LLM delay: ${(tLlmStart - tSttEnd).toFixed(2)} ms`);

      const stream = await streamAnswer(conversation);

      let firstTokenTime: number | null = null;

      const tts = new CartesiaStream(`turn-${Date.now()}`);
      activeTTS = tts;

      const tTtsConnect = now();
      await tts.ready();
      const tTtsReady = now();

      console.log(`🔊 TTS WebSocket ready at: ${tTtsReady.toFixed(2)} ms`);
      console.log(`⏱️ TTS connection time: ${(tTtsReady - tTtsConnect).toFixed(2)} ms`);

      if (myTurn !== currentTurnId) return;

      state = "SPEAKING";

      let firstAudioSent = false;

      tts.on("audio", (audio: Buffer) => {
        if (myTurn !== currentTurnId) return;

        if (!firstAudioSent) {
          firstAudioSent = true;
          const tFirstAudio = now();

          console.log("\n🗣️ === TTS STARTED SPEAKING ===");
          console.log(`📍 First audio chunk at: ${tFirstAudio.toFixed(2)} ms`);
          console.log(`⏱️ STT → First Audio: ${(tFirstAudio - tSttEnd).toFixed(2)} ms`);

          if (firstTokenTime) {
            console.log(
              `⏱️ First LLM Token → First Audio: ${(tFirstAudio - firstTokenTime).toFixed(2)} ms`
            );
          }
        }

        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(audio);
        }
      });

      let assistantReply = "";

      for await (const chunk of stream) {
        if (myTurn !== currentTurnId) {
          console.log("⚡ Ignoring stale LLM stream");
          break;
        }

        if (!chunk || typeof chunk !== "object") continue;
        if (!("content" in chunk)) continue;
        if (typeof chunk.content !== "string") continue;

        if (!firstTokenTime) {
          firstTokenTime = now();
          console.log("\n🧠 === LLM FIRST TOKEN RECEIVED ===");
          console.log(`📍 First token at: ${firstTokenTime.toFixed(2)} ms`);
          console.log(
            `⏱️ LLM latency (request → first token): ${(firstTokenTime - tLlmStart).toFixed(2)} ms`
          );
          console.log(
            `⏱️ STT → First Token: ${(firstTokenTime - tSttEnd).toFixed(2)} ms`
          );
        }

        assistantReply += chunk.content;
        tts.send(chunk.content, true);
      }

      if (myTurn !== currentTurnId) return;

      try {
        await new Promise<void>((resolve, reject) => {
          tts.once("done", resolve);
          tts.once("error", reject);
          tts.flush();
        });
      } catch {}

      try {
        tts.close();
      } catch {}

      const tComplete = now();
      console.log("\n✅ === LLM STREAM FINISHED ===");
      console.log(`📍 Completed at: ${tComplete.toFixed(2)} ms`);
      console.log(
        `⏱️ Total turn duration: ${(tComplete - tSttEnd).toFixed(2)} ms\n`
      );

      conversation.push({ role: "assistant", content: assistantReply });

      state = "IDLE";
    }

    /* ================= CLIENT AUDIO ================= */

    clientWs.on("message", (data) => {
      if (!(data instanceof Buffer)) return;
      if (sonioxWs?.readyState === WebSocket.OPEN) {
        sonioxWs.send(data);
      }
    });

    clientWs.on("close", () => {
      try {
        if (activeTTS) activeTTS.close();
      } catch {}

      stopKeepAlive();
      if (sonioxWs) sonioxWs.close();
    });

    connectSoniox();
  });
}
