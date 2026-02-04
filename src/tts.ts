import { CartesiaClient } from "@cartesia/cartesia-js";

const client = new CartesiaClient({
  apiKey: process.env.CARTESIA_API_KEY!,
});

/**
 * Synchronous TTS using Cartesia Sonic (Bytes API)
 */
export async function textToSpeech(text: string): Promise<Buffer> {
  console.log("🔊 [CARTESIA] Sonic TTS request");

  const response = await client.tts.bytes({
    modelId: "sonic-3",
    voice: {
      mode: "id",
      id: "694f9389-aac1-45b6-b726-9d9369183238", // default Sonic voice
    },
    outputFormat: {
      container: "wav",
      encoding: "pcm_s16le",
      sampleRate: 44100,
    },
    transcript: text,
  });

  // SDK returns a Response-like object → convert to bytes
  const audioBytes = await new Response(response).arrayBuffer();
  const audioBuffer = Buffer.from(audioBytes);

  console.log(`✅ [CARTESIA] Audio generated (${audioBuffer.length} bytes)`);

  return audioBuffer;
}
