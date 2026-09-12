"use client";

import Link from "next/link";

export type AgentSummary = {
  id: string;
  slug: string;
  name: string;
  title: string;
  accent: string;
  modelId?: string;
  modelName?: string;
};

export function AgentSwitcher({
  agents,
  activeId,
  onChange,
  disabled,
}: {
  agents: AgentSummary[];
  activeId?: string;
  onChange: (agentId: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {agents.map((agent) => {
        const active = agent.id === activeId;
        return (
          <button
            key={agent.id}
            type="button"
            disabled={disabled}
            onClick={() => onChange(agent.id)}
            className={`group flex items-center gap-2 rounded-full border px-3 py-1.5 text-left transition ${
              active
                ? "border-transparent bg-ink-foam/12 text-ink-foam"
                : "border-ink-line/70 text-ink-mist hover:border-ink-mist/40 hover:text-ink-foam"
            } disabled:opacity-50`}
            style={
              active
                ? { boxShadow: `inset 0 0 0 1px ${agent.accent}55` }
                : undefined
            }
            title={agent.modelId || agent.title || agent.name}
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: agent.accent }}
            />
            <span className="text-xs font-medium tracking-wide">
              {agent.name}
            </span>
          </button>
        );
      })}
      <Link
        href="/agents/new"
        className="rounded-full border border-dashed border-coastal/50 px-3 py-1.5 text-xs font-medium text-coastal hover:border-coastal hover:text-coastal-bright"
      >
        New agent
      </Link>
    </div>
  );
}
