import { neurolink } from "./neurolink.js";

export async function streamAnswer(prompt: string) {
  console.log("🤖 LLM stream started");

  const result = await neurolink.stream({
    provider: "vertex",                 
    model: "gemini-2.5-flash",           // fastest on Vertex
    input: { text: prompt },

    temperature: 0.3,
    maxTokens: 120,
    disableTools: true,

    systemPrompt: `
You are a helpful voice assistant.
Answer conversationally in 2–3 sentences.
Be clear and concise.
`
  });

  return result.stream; // 🔥 async iterator
}
