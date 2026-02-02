import { neurolink } from "./neurolink.js";


export async function textToSpeech(text: string): Promise<Buffer> {
  const result = await neurolink.generate({
  provider: "vertex",
  model: "gemini-2.5-flash",

  input: {
    text: text
  },

  tts: {
    enabled: true,
    useAiResponse: false,
    voice: "en-US-Wavenet-D",  // ⚡ English voice (faster for English text)
    format: "mp3"
  }
});

  if (!result.audio) {
    throw new Error("TTS failed: No audio returned");
  }


  return result.audio.buffer;
}

