import type { ChatMessage } from "./llm";
import { agentReplyToChatHistory } from "./agent-reply";

export function mapThreadMessagesToChatHistory(
  messages: Array<{ role: string; content: string }>
): ChatMessage[] {
  return messages
    .filter((m) => m.role === "user" || m.role === "assistant" || m.role === "agent_reply")
    .map((m) => {
      if (m.role === "agent_reply") {
        return {
          role: "user" as const,
          content: agentReplyToChatHistory(m.content),
        };
      }
      return {
        role: m.role as "user" | "assistant",
        content: m.content,
      };
    });
}
