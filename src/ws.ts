import WebSocket, { WebSocketServer } from "ws";
import { speechToText } from "./stt.js";
import { generateAnswer } from "./llm.js";
import { textToSpeech } from "./tts.js";

export function setupWebSocket(server: any) {
  const wss = new WebSocketServer({ server });

  wss.on("connection", (ws) => {
    console.log("Client connected");

    let textBuffer = "";
    let silenceTimer: NodeJS.Timeout | null = null;
    let processing = false;

    // 🔕 prevents echo / silence after TTS
    let lastTTSAt = 0;

    ws.on("message", async (data: Buffer) => {
      /* ---------------- GUARDS ---------------- */

      // Ignore mic noise right after TTS
      if (Date.now() - lastTTSAt < 2000) {
        console.log("Ignoring audio — post-TTS cooldown");
        return;
      }

      // Ignore silence blobs
      if (data.byteLength < 8000) {
        console.log("Ignoring tiny audio chunk");
        return;
      }

      if (processing) {
        console.log("Skipping — already processing");
        return;
      }

      /* ---------------- STT ---------------- */

      const chunkText = await speechToText(data).catch(() => "");

      if (!chunkText || chunkText.trim().length === 0) {
        console.warn("STT: no speech detected");
        return;
      }

      console.log("STT:", chunkText);

      // Append rolling transcript
      textBuffer += " " + chunkText;

      // Reset silence timer
      if (silenceTimer) clearTimeout(silenceTimer);

      silenceTimer = setTimeout(async () => {
        const finalText = textBuffer.trim();
        textBuffer = "";

        // Require meaningful sentence
        if (finalText.split(" ").length < 3) {
          console.log("Ignoring short fragment:", finalText);
          return;
        }

        processing = true;

        try {
          console.log("FINAL USER INPUT:", finalText);

          /* ---------------- LLM ---------------- */

          const answer = await generateAnswer(finalText).catch(() => "");

          if (!answer || answer.trim().length === 0) {
            console.warn("LLM returned empty response");
            return;
          }

          console.log("LLM:", answer);

          /* ---------------- TTS ---------------- */

          const audio = await textToSpeech(answer).catch(() => null);

          if (!audio) {
            console.warn("TTS failed — no audio");
            return;
          }

          ws.send(audio);
          lastTTSAt = Date.now(); // 🔕 activate cooldown
        } catch (err) {
          console.error("WS processing error:", err);
        } finally {
          processing = false;
        }
      }, 2800); // 🧠 silence window (key)
    });

    ws.on("close", () => {
      console.log("Client disconnected");
      if (silenceTimer) clearTimeout(silenceTimer);
    });
  });
}
