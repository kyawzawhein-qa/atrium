import type { ChatMessage } from "./llm";
import { agentReplyToChatHistory } from "./agent-reply";
import { wrapUntrusted } from "./untrusted";

export type ThreadHistoryMessage = {
  role: string;
  content: string;
  createdAt?: string | Date;
};

export function mapThreadMessagesToChatHistory(
  messages: ThreadHistoryMessage[]
): ChatMessage[] {
  return messages
    .filter((m) => m.role === "user" || m.role === "assistant" || m.role === "agent_reply")
    .map((m) => {
      if (m.role === "agent_reply") {
        return {
          role: "user" as const,
          content: agentReplyToChatHistory(m.content, m.createdAt),
        };
      }
      const source =
        m.role === "user"
          ? "transcript:thread:user"
          : "transcript:thread:assistant";
      return {
        role: m.role as "user" | "assistant",
        content: wrapUntrusted({
          content: m.content,
          source,
          timestamp: m.createdAt,
        }),
      };
    });
}