"use client";

import { toolDisplay } from "@/lib/tools";

export function ToolChip({ id }: { id: string }) {
  const tool = toolDisplay(id);
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-ink-line/60 bg-ink-panel/80 px-2.5 py-1 text-[11px] tracking-wide text-ink-mist"
      title={`${tool.hint} — ${tool.status}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-amber-400/80" />
      <span className="font-medium text-ink-foam">{tool.label}</span>
      <span className="text-ink-mist/70">· {tool.status}</span>
    </span>
  );
}
