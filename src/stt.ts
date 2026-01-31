import { neurolink } from "./neurolink.js";

export async function speechToText(audioBuffer: Buffer): Promise<string> {
  const result = await neurolink.generate({
    provider: "vertex",
    input: {
      text: "Transcribe this audio",
      audioFiles: [audioBuffer],
    },
    stt: {
      languageCode: "en-IN",
      enableAutomaticPunctuation: true,
    },
  });

  // SAFEST extraction
  if (result.transcription?.text) {
    return result.transcription.text;
  }

  if (result.content) {
    return result.content;
  }

  throw new Error("STT failed: no transcription returned");
}
