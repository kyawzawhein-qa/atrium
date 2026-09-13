"use client";

import { toolDisplay } from "@/lib/tools";

export type ToolChipStatus = "ran" | "denied" | "error" | "needs_approval";

export type ToolChipData = {
  id: string;
  name: string;
  status?: ToolChipStatus;
  detail?: string;
  approvalId?: string;
};

const STATUS_DOT: Record<ToolChipStatus, string> = {
  ran: "bg-coastal",
  error: "bg-rose-400",
  needs_approval: "bg-amber-400",
  denied: "bg-ink-mist/60",
};

const STATUS_RING: Record<ToolChipStatus, string> = {
  ran: "border-coastal/40 text-coastal-bright",
  error: "border-rose-400/40 text-rose-200",
  needs_approval: "border-amber-400/40 text-amber-100",
  denied: "border-ink-line/60 text-ink-mist",
};

export function ToolChip({
  id,
  name,
  status,
  detail,
  approvalId,
  onApprove,
  onDeny,
  busy,
}: ToolChipData & {
  onApprove?: (approvalId: string) => void;
  onDeny?: (approvalId: string) => void;
  busy?: boolean;
}) {
  const tool = toolDisplay(name || id);
  const resolved: ToolChipStatus = status ?? "ran";
  const showApproval =
    resolved === "needs_approval" && approvalId && (onApprove || onDeny);

  return (
    <span
      className={`inline-flex flex-wrap items-center gap-1.5 rounded-full border bg-ink-panel/80 px-2.5 py-1 text-[11px] tracking-wide ${STATUS_RING[resolved]}`}
      title={detail || `${tool.hint} — ${resolved}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[resolved]}`} />
      <span className="font-medium text-ink-foam">{tool.label}</span>
      <span className="opacity-80">· {resolved.replace("_", " ")}</span>
      {showApproval && (
        <span className="ml-1 inline-flex gap-1">
          <button
            type="button"
            disabled={busy}
            onClick={() => approvalId && onApprove?.(approvalId)}
            className="rounded-full bg-coastal/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-deep hover:bg-coastal-bright disabled:opacity-40"
          >
            Approve
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => approvalId && onDeny?.(approvalId)}
            className="rounded-full border border-ink-line px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-mist hover:text-ink-foam disabled:opacity-40"
          >
            Deny
          </button>
        </span>
      )}
    </span>
  );
}
