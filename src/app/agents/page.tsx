"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { StudioFrame } from "@/components/StudioFrame";
import type { AgentSummary } from "@/components/AgentSwitcher";

type AgentRow = AgentSummary & {
  description: string;
  modelId: string;
  modelName: string;
};

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    const [a, s] = await Promise.all([
      fetch("/api/agents"),
      fetch("/api/settings"),
    ]);
    if (a.ok) {
      const data = await a.json();
      setAgents(data.agents);
    }
    if (s.ok) {
      const data = await s.json();
      setHasKey(Boolean(data.settings?.hasKey));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function remove(id: string) {
    if (!confirm("Delete this agent and its conversations?")) return;
    setBusyId(id);
    await fetch(`/api/agents/${id}`, { method: "DELETE" });
    await load();
    setBusyId(null);
  }

  return (
    <StudioFrame
      title="Agents"
      subtitle="Each agent has a name, a persona (description), and its own OpenRouter model."
    >
      {hasKey === false && (
        <div className="mb-6 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          Add OpenRouter key to create agents and chat for real.
        </div>
      )}

      <div className="mb-6">
        <Link
          href="/agents/new"
          className="inline-flex rounded-xl bg-coastal px-4 py-2 text-sm font-semibold text-ink-deep hover:bg-coastal-bright"
        >
          New agent
        </Link>
      </div>

      {agents.length === 0 && (
        <p className="text-sm text-ink-mist">No agents yet. Create the first one.</p>
      )}

      <ul className="space-y-3">
        {agents.map((agent) => (
          <li
            key={agent.id}
            className="rounded-2xl border border-ink-line/60 bg-ink-panel/50 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: agent.accent }}
                  />
                  <div className="truncate font-medium text-ink-foam">
                    {agent.name}
                  </div>
                </div>
                {agent.title && (
                  <div className="mt-1 text-xs uppercase tracking-[0.16em] text-ink-mist/70">
                    {agent.title}
                  </div>
                )}
                <p className="mt-2 line-clamp-2 text-sm text-ink-mist">
                  {agent.description || "No persona yet."}
                </p>
                <p className="mt-2 text-xs text-ink-mist/70">
                  {agent.modelId
                    ? `${agent.modelName || agent.modelId} · ${agent.modelId}`
                    : "No model selected"}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Link
                  href={`/agents/${agent.id}/edit`}
                  className="rounded-lg border border-ink-line px-2.5 py-1 text-xs text-ink-mist hover:text-ink-foam"
                >
                  Edit
                </Link>
                <button
                  type="button"
                  disabled={busyId === agent.id}
                  onClick={() => void remove(agent.id)}
                  className="rounded-lg border border-ink-line px-2.5 py-1 text-xs text-ink-mist hover:text-rose-300 disabled:opacity-40"
                >
                  Delete
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </StudioFrame>
  );
}
