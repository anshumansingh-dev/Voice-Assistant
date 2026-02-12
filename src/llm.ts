import { neurolink } from "./neurolink.js";

export type Message = {
  role: "system" | "user" | "assistant";
  content: string;
};

export async function streamAnswer(
  messages: Message[],
  options?: { timeoutMs?: number }
) {
  const formattedConversation = messages
    .map(m => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n");

  const result = await neurolink.stream({
    provider: "azure",
    model: "gpt-4o-automatic",

    input: {
      text: formattedConversation,
    },

    temperature: 0.3,
    maxTokens: 150,
    disableTools: true,

    timeout: options?.timeoutMs ?? 30000,

    systemPrompt: `
You are a real-time voice assistant.
Respond naturally and concisely.
Use short spoken sentences.
Do not write paragraphs.
`
  });

  return result.stream;
}
