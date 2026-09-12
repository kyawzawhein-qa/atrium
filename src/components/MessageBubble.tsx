"use client";

import { ToolChip } from "./ToolChip";

export type UiMessage = {
  id: string;
  role: string;
  content: string;
  toolHints?: string | null;
  createdAt?: string;
};

function parseHints(raw?: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function MessageBubble({
  message,
  accent,
}: {
  message: UiMessage;
  accent: string;
}) {
  const isUser = message.role === "user";
  const hints = parseHints(message.toolHints);

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[min(42rem,92%)] rounded-2xl px-4 py-3 text-[15px] leading-relaxed ${
          isUser
            ? "rounded-br-md bg-ink-foam/10 text-ink-foam ring-1 ring-ink-foam/15"
            : "rounded-bl-md bg-ink-panel text-ink-foam/95 ring-1 ring-ink-line/50"
        }`}
        style={
          !isUser
            ? { boxShadow: `inset 3px 0 0 0 ${accent}` }
            : undefined
        }
      >
        <div className="whitespace-pre-wrap break-words">{message.content}</div>
        {hints.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {hints.map((id) => (
              <ToolChip key={id} id={id} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
