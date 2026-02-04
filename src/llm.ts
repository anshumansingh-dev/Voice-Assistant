import { neurolink } from "./neurolink.js";

export async function generateAnswer(prompt: string): Promise<string> {
  const result = await neurolink.generate({
    provider: "azure",
    model: "gpt-4o-automatic",

    input: {
      text: prompt,
    },

    // ⚡ CRITICAL FOR LATENCY
    temperature: 0.25,      // lower = faster + stable
    maxTokens: 140,         // ⬅️ FIXES HALF ANSWERS
    disableTools: true,     // ⬅️ removes orchestration
    enableAnalytics: false,
    enableEvaluation: false,

    // 🧠 Voice-specific instruction
    systemPrompt: `
You are a helpful voice assistant.
Answer in one short, complete paragraph.
Finish your sentence.
Keep the answer simple and conversational.
If unclear, ask one clarifying question.
Do not use bullet points.
`,
  });

  return result.content.trim();
}
