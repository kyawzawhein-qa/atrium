"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ThreadList, type ThreadSummary } from "./ThreadList";
import { AgentSwitcher, type AgentSummary } from "./AgentSwitcher";
import { MessageBubble, type UiMessage } from "./MessageBubble";

type ThreadDetail = ThreadSummary & {
  messages: UiMessage[];
  agentId: string;
};

export function AppShell({
  initialThreadId,
}: {
  initialThreadId?: string;
}) {
  const router = useRouter();
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [activeId, setActiveId] = useState<string | undefined>(initialThreadId);
  const [detail, setDetail] = useState<ThreadDetail | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | undefined>();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAgents = useCallback(async () => {
    const res = await fetch("/api/agents");
    if (!res.ok) return;
    const data = await res.json();
    setAgents(data.agents);
    setSelectedAgentId((prev) => prev || data.agents[0]?.id);
  }, []);

  const loadThreads = useCallback(async () => {
    const res = await fetch("/api/threads");
    if (!res.ok) return;
    const data = await res.json();
    setThreads(data.threads);
  }, []);

  const loadThread = useCallback(async (id: string) => {
    const res = await fetch(`/api/threads/${id}`);
    if (!res.ok) {
      setDetail(null);
      return;
    }
    const data = await res.json();
    setDetail(data.thread);
    setSelectedAgentId(data.thread.agentId);
  }, []);

  useEffect(() => {
    void loadAgents();
    void loadThreads();
  }, [loadAgents, loadThreads]);

  useEffect(() => {
    if (activeId) {
      void loadThread(activeId);
    } else {
      setDetail(null);
    }
  }, [activeId, loadThread]);

  const activeAgent = useMemo(() => {
    const id = detail?.agentId || selectedAgentId;
    return agents.find((a) => a.id === id);
  }, [agents, detail, selectedAgentId]);

  async function createThread(agentId?: string) {
    const aid = agentId || selectedAgentId || agents[0]?.id;
    if (!aid) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: aid }),
      });
      if (!res.ok) throw new Error("Could not create thread");
      const data = await res.json();
      await loadThreads();
      setActiveId(data.thread.id);
      router.replace(`/chat/${data.thread.id}`);
      setMobileNav(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function deleteThread(id: string) {
    await fetch(`/api/threads/${id}`, { method: "DELETE" });
    await loadThreads();
    if (activeId === id) {
      setActiveId(undefined);
      setDetail(null);
      router.replace("/chat");
    }
  }

  async function switchAgent(agentId: string) {
    setSelectedAgentId(agentId);
    if (!detail) return;
    const res = await fetch(`/api/threads/${detail.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId }),
    });
    if (res.ok) {
      await loadThread(detail.id);
      await loadThreads();
    }
  }

  async function sendMessage() {
    const text = draft.trim();
    if (!text || busy) return;

    let threadId = activeId;
    if (!threadId) {
      const aid = selectedAgentId || agents[0]?.id;
      if (!aid) return;
      setBusy(true);
      const res = await fetch("/api/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: aid }),
      });
      if (!res.ok) {
        setBusy(false);
        setError("Could not create thread");
        return;
      }
      const data = await res.json();
      threadId = data.thread.id as string;
      setActiveId(threadId);
      router.replace(`/chat/${threadId}`);
      await loadThreads();
    }

    setDraft("");
    setBusy(true);
    setError(null);

    // Optimistic user bubble
    setDetail((prev) =>
      prev
        ? {
            ...prev,
            messages: [
              ...prev.messages,
              {
                id: `tmp-${Date.now()}`,
                role: "user",
                content: text,
              },
            ],
          }
        : prev
    );

    try {
      const res = await fetch(`/api/threads/${threadId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      const data = await res.json();
      if (data.thread) {
        setDetail(data.thread);
      } else if (!res.ok) {
        setError(data.error || "Send failed");
      }
      await loadThreads();
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-ink-deep text-ink-foam">
      <div
        className={`${
          mobileNav ? "fixed inset-0 z-40 flex" : "hidden"
        } md:relative md:flex md:w-72 lg:w-80`}
      >
        <div className="h-full w-72 lg:w-80">
          <ThreadList
            threads={threads}
            activeId={activeId}
            onSelect={(id) => {
              setActiveId(id);
              router.replace(`/chat/${id}`);
              setMobileNav(false);
            }}
            onCreate={() => void createThread()}
            onDelete={(id) => void deleteThread(id)}
          />
        </div>
        {mobileNav && (
          <button
            type="button"
            className="flex-1 bg-black/50 md:hidden"
            aria-label="Close menu"
            onClick={() => setMobileNav(false)}
          />
        )}
      </div>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-3 border-b border-ink-line/60 bg-ink-deep/90 px-4 py-3 backdrop-blur">
          <button
            type="button"
            className="rounded-lg border border-ink-line px-2 py-1 text-xs text-ink-mist md:hidden"
            onClick={() => setMobileNav(true)}
          >
            Threads
          </button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-ink-foam">
              {detail?.title || "New conversation"}
            </div>
            <div className="truncate text-[11px] text-ink-mist/70">
              {activeAgent
                ? `${activeAgent.name} · ${activeAgent.title}`
                : "Pick an agent to begin"}
            </div>
          </div>
          <AgentSwitcher
            agents={agents}
            activeId={selectedAgentId}
            onChange={(id) => void switchAgent(id)}
            disabled={busy}
          />
          <button
            type="button"
            onClick={() => void logout()}
            className="rounded-lg border border-ink-line/80 px-2.5 py-1.5 text-[11px] uppercase tracking-wider text-ink-mist hover:text-ink-foam"
          >
            Sign out
          </button>
        </header>

        <div className="relative flex-1 overflow-y-auto">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(91,138,154,0.12),_transparent_55%),radial-gradient(ellipse_at_bottom_right,_rgba(196,165,116,0.08),_transparent_40%)]" />
          <div className="relative mx-auto flex max-w-3xl flex-col gap-4 px-4 py-8">
            {!detail && (
              <div className="mx-auto mt-16 max-w-md rounded-3xl border border-ink-line/50 bg-ink-panel/40 p-8 text-center">
                <div className="font-display text-xl tracking-[0.14em] text-ink-foam">
                  Quiet workspace
                </div>
                <p className="mt-3 text-sm leading-relaxed text-ink-mist">
                  Choose an agent above, then start typing—or open a thread from
                  the left rail. Each specialist keeps their own voice and brief.
                </p>
                <button
                  type="button"
                  onClick={() => void createThread()}
                  disabled={busy || !selectedAgentId}
                  className="mt-6 rounded-xl bg-coastal px-4 py-2 text-sm font-semibold text-ink-deep hover:bg-coastal-bright disabled:opacity-50"
                >
                  Begin conversation
                </button>
              </div>
            )}

            {detail?.messages.map((m) => (
              <MessageBubble
                key={m.id}
                message={m}
                accent={detail.agent.accent}
              />
            ))}

            {busy && (
              <div className="text-sm text-ink-mist/80">
                {activeAgent?.name || "Agent"} is composing…
              </div>
            )}
            {error && (
              <div className="rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                {error}
              </div>
            )}
          </div>
        </div>

        <footer className="border-t border-ink-line/60 bg-ink-deep/95 px-4 py-4">
          <div className="mx-auto flex max-w-3xl gap-3">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void sendMessage();
                }
              }}
              rows={2}
              placeholder={
                activeAgent
                  ? `Message ${activeAgent.name}…`
                  : "Select an agent, then write…"
              }
              className="min-h-[3.25rem] flex-1 resize-none rounded-2xl border border-ink-line bg-ink-panel/70 px-4 py-3 text-sm text-ink-foam outline-none ring-coastal/30 placeholder:text-ink-mist/45 focus:ring-2"
            />
            <button
              type="button"
              onClick={() => void sendMessage()}
              disabled={busy || !draft.trim()}
              className="self-end rounded-2xl bg-coastal px-4 py-3 text-sm font-semibold text-ink-deep transition hover:bg-coastal-bright disabled:opacity-40"
            >
              Send
            </button>
          </div>
        </footer>
      </main>
    </div>
  );
}
