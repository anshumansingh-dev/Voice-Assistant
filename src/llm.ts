import { neurolink } from "./neurolink.js";

export async function streamAnswer(prompt: string) {
  const result = await neurolink.stream({
    provider: "azure",
    model: "gpt-4o-automatic",

    input: {
      text: prompt
    },

    temperature: 0.3,
    maxTokens: 150,
    disableTools: true,

    systemPrompt: `
You are a real-time voice assistant.
Keep answers short, conversational, and natural.
Speak in 1–2 short sentences.
`
  });

  return result.stream; // AsyncIterable<{ content?: string }>
}