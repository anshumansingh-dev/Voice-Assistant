import { neurolink } from "./neurolink.js";

export async function generateAnswer(prompt: string): Promise<string> {
  const result = await neurolink.generate({
    provider: "vertex",
    model: "gemini-2.5-flash",
    input: {
      text: prompt,
    },
    //disableTools: true,

    systemPrompt: `
You are a helpful voice assistant.
Answer conversationally.
If unclear, ask a clarifying question.
Do not give points , give answers in one paragraph keep answer simple and short.
`,

//     temperature: 0.4,
//     maxTokens: 80,
 });

  return result.content.trim();
}

