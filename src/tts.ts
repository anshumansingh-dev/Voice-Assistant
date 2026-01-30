import { neurolink } from "./neurolink.js";


export async function textToSpeech(text: string): Promise<Buffer> {
  const result = await neurolink.generate({

    input: { text: `${text}\nAnswer in ONE short line only. Max 20 words.` },

   
    provider: "google-ai",


    tts: {
      enabled: true,
      useAiResponse: true, 
      voice: "hi-IN-Wavenet-A",
      format: "mp3",
      speed: 1.0,
      pitch: 0.0
    }
  });

  if (!result.audio) {
    throw new Error("TTS failed: No audio returned");
  }


  return result.audio.buffer;
}

