import WebSocket, { WebSocketServer } from "ws";
import { speechToText } from "./stt.js";
import { generateAnswer } from "./llm.js";
import { textToSpeech } from "./tts.js";

const now = () => new Date().toISOString();

export function setupWebSocket(server: any) {
  const wss = new WebSocketServer({ server });

  wss.on("connection", (ws) => {
    console.log(`[${now()}] 🔌 Client connected`);

    let processing = false;
    let lastTTSAt = 0;

    ws.on("message", async (data: Buffer) => {
      console.log(`[${now()}] 📥 Server received audio | size=${data.byteLength}`);

      // 🔕 Ignore echo
      if (Date.now() - lastTTSAt < 2000) {
        console.log(`[${now()}] 🔕 Ignoring post-TTS echo`);
        return;
      }

      if (processing) {
        console.log(`[${now()}] ⏭️ Skipping — already processing`);
        return;
      }

      if (data.byteLength < 8000) {
        console.log(`[${now()}] 🫥 Ignoring tiny blob`);
        return;
      }

      processing = true;

      try {
        console.log(`[${now()}] 🧠 STT started`);
        const sttStart = Date.now();

        const text = await speechToText(data).catch(() => "");

        console.log(
          `[${now()}] 🧠 STT finished | ${Date.now() - sttStart}ms | text="${text}"`
        );

        if (!text || text.trim().length < 3) {
          console.log(`[${now()}] 🔇 STT empty result`);
          return;
        }

        console.log(`[${now()}] 🤖 LLM started`);
        const llmStart = Date.now();

        const answer = await generateAnswer(text).catch(() => "");

        console.log(
          `[${now()}] 🤖 LLM finished | ${Date.now() - llmStart}ms | length=${answer.length}`
        );

        if (!answer) return;

        console.log(`[${now()}] 🔊 TTS started`);
        const ttsStart = Date.now();

        const audio = await textToSpeech(answer).catch(() => null);

        console.log(
          `[${now()}] 🔊 TTS finished | ${Date.now() - ttsStart}ms | audioSize=${audio?.length}`
        );

        if (!audio) return;

        ws.send(audio);
        lastTTSAt = Date.now();
        console.log(`[${now()}] 🚀 Sending audio to client`);
      } catch (err) {
        console.error(`[${now()}] ❌ WS error`, err);
      } finally {
        processing = false;
      }
    });

    ws.on("close", () => {
      console.log(`[${now()}] ❌ Client disconnected`);
    });
  });
}
