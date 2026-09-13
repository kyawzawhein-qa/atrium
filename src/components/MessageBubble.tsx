"use client";

import { ToolChip, type ToolChipData, type ToolChipStatus } from "./ToolChip";

export type UiMessage = {
  id: string;
  role: string;
  content: string;
  toolHints?: string | null;
  createdAt?: string;
};

function parseHints(raw?: string | null): ToolChipData[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item): ToolChipData | null => {
        if (typeof item === "string") {
          return { id: item, name: item, status: "ran" };
        }
        if (item && typeof item === "object") {
          const rec = item as Record<string, unknown>;
          const name = String(rec.name || rec.id || "tool");
          const id = String(rec.id || name);
          const status = (rec.status as ToolChipStatus) || "ran";
          return {
            id,
            name,
            status,
            detail: typeof rec.detail === "string" ? rec.detail : undefined,
            approvalId:
              typeof rec.approvalId === "string" ? rec.approvalId : undefined,
          };
        }
        return null;
      })
      .filter((x): x is ToolChipData => x !== null);
  } catch {
    return [];
  }
}

export function MessageBubble({
  message,
  accent,
  onApprove,
  onDeny,
  approvalBusy,
}: {
  message: UiMessage;
  accent: string;
  onApprove?: (approvalId: string) => void;
  onDeny?: (approvalId: string) => void;
  approvalBusy?: boolean;
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
            {hints.map((h) => (
              <ToolChip
                key={h.id}
                {...h}
                onApprove={onApprove}
                onDeny={onDeny}
                busy={approvalBusy}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
