"use client";

import Link from "next/link";

export type ThreadSummary = {
  id: string;
  title: string;
  updatedAt: string;
  agent: {
    id: string;
    name: string;
    title: string;
    accent: string;
    slug: string;
    modelId?: string;
    modelName?: string;
  };
};

export function ThreadList({
  threads,
  activeId,
  onSelect,
  onCreate,
  onDelete,
}: {
  threads: ThreadSummary[];
  activeId?: string;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <aside className="flex h-full w-full flex-col border-r border-ink-line/60 bg-ink-deep/80">
      <div className="flex items-center justify-between gap-2 border-b border-ink-line/60 px-4 py-4">
        <Link href="/chat" className="min-w-0">
          <img
            src="/brand/logo-wordmark.svg"
            alt="Atrium"
            className="h-7 w-auto"
          />
          <div className="mt-1 text-[11px] uppercase tracking-[0.22em] text-ink-mist/70">
            Multi-agent desk
          </div>
        </Link>
        <button
          type="button"
          onClick={onCreate}
          className="rounded-lg bg-coastal px-2.5 py-1.5 text-xs font-medium text-ink-deep transition hover:bg-coastal-bright"
          title="New conversation"
        >
          New
        </button>
      </div>

      <nav className="flex gap-2 border-b border-ink-line/50 px-3 py-2 text-[11px]">
        <Link
          href="/agents"
          className="rounded-md px-2 py-1 text-ink-mist hover:bg-ink-panel hover:text-ink-foam"
        >
          Agents
        </Link>
        <Link
          href="/agents/new"
          className="rounded-md px-2 py-1 text-ink-mist hover:bg-ink-panel hover:text-ink-foam"
        >
          New agent
        </Link>
        <Link
          href="/settings"
          className="rounded-md px-2 py-1 text-ink-mist hover:bg-ink-panel hover:text-ink-foam"
        >
          Settings
        </Link>
      </nav>

      <div className="flex-1 overflow-y-auto px-2 py-3">
        {threads.length === 0 && (
          <p className="px-2 py-6 text-center text-sm text-ink-mist/70">
            No threads yet. Start one with an agent.
          </p>
        )}
        <ul className="space-y-1">
          {threads.map((t) => {
            const active = t.id === activeId;
            return (
              <li key={t.id} className="group relative">
                <button
                  type="button"
                  onClick={() => onSelect(t.id)}
                  className={`w-full rounded-xl px-3 py-2.5 text-left transition ${
                    active
                      ? "bg-ink-panel text-ink-foam"
                      : "text-ink-mist hover:bg-ink-panel/60 hover:text-ink-foam"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="mt-0.5 h-2 w-2 shrink-0 rounded-full"
                      style={{ background: t.agent.accent }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {t.title}
                      </div>
                      <div className="truncate text-[11px] text-ink-mist/65">
                        {t.agent.name}
                        {t.agent.modelName
                          ? ` · ${t.agent.modelName}`
                          : t.agent.title
                            ? ` · ${t.agent.title}`
                            : ""}
                      </div>
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  aria-label="Delete thread"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(t.id);
                  }}
                  className="absolute right-2 top-2 hidden rounded-md px-1.5 py-0.5 text-[10px] text-ink-mist/80 hover:bg-ink-deep hover:text-rose-300 group-hover:block"
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}
