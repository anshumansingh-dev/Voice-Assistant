// src/tts.ts
import WebSocket from "ws";

const CARTESIA_WS_URL = "wss://api.cartesia.ai/tts/websocket";

export async function* streamTextToSpeech(text: string) {
  const ws = new WebSocket(CARTESIA_WS_URL, {
    headers: {
      Authorization: `Bearer ${process.env.CARTESIA_API_KEY}`,
    },
  });

  // --- Async queue plumbing ---
  const queue: Buffer[] = [];
  let done = false;
  let error: Error | null = null;

  ws.on("message", (data: WebSocket.RawData) => {
  if (typeof data === "string") return;

  if (Buffer.isBuffer(data)) {
    queue.push(data);
  } else if (data instanceof ArrayBuffer) {
    queue.push(Buffer.from(new Uint8Array(data)));
  } else if (Array.isArray(data)) {
    // Buffer[] case (rare but valid)
    queue.push(Buffer.concat(data));
  }
});

  ws.on("close", () => {
    done = true;
  });

  ws.on("error", (err) => {
    error = err;
    done = true;
  });

  // --- Wait for connection ---
  await new Promise<void>((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });

  console.log("🔊 [CARTESIA] WS connected");

  // --- Send TTS request ---
  ws.send(
    JSON.stringify({
      model_id: "sonic-3",
      voice_id: "694f9389-aac1-45b6-b726-9d9369183238",
      output_format: {
        container: "raw",
        encoding: "pcm_s16le",
        sample_rate: 24000,
      },
      transcript: text,
    })
  );

  const tFirstAudio = Date.now();
  let firstChunk = true;

  // --- Stream audio chunks ---
  while (!done || queue.length > 0) {
    if (error) throw error;

    if (queue.length === 0) {
      // prevent busy loop
      await new Promise((r) => setTimeout(r, 5));
      continue;
    }

    const chunk = queue.shift()!;
    if (firstChunk) {
      console.log(
        `🔊 [CARTESIA] First audio chunk | ${(Date.now() - tFirstAudio) / 1000}s`
      );
      firstChunk = false;
    }

    yield chunk;
  }

  ws.close();
  console.log("🔊 [CARTESIA] Stream ended");
}
