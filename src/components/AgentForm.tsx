"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export type AgentDraft = {
  id?: string;
  name: string;
  description: string;
  modelId: string;
  modelName: string;
  title?: string;
};

type OrModel = { id: string; name: string };

export function AgentForm({ initial }: { initial?: AgentDraft }) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [modelId, setModelId] = useState(initial?.modelId ?? "");
  const [modelName, setModelName] = useState(initial?.modelName ?? "");
  const [models, setModels] = useState<OrModel[]>([]);
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    void (async () => {
      const s = await fetch("/api/settings");
      if (s.ok) {
        const data = await s.json();
        setHasKey(Boolean(data.settings?.hasKey));
      }
      const res = await fetch("/api/openrouter/models");
      const data = await res.json();
      if (!res.ok) {
        setModelsError(data.error || "Could not load models");
        setModels([]);
        return;
      }
      setModels(data.models ?? []);
    })();
  }, []);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return models;
    return models.filter(
      (m) =>
        m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)
    );
  }, [models, filter]);

  function onPickModel(id: string) {
    setModelId(id);
    const found = models.find((m) => m.id === id);
    setModelName(found?.name ?? "");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    setBusy(true);
    setError(null);
    const payload = {
      name: name.trim(),
      description,
      modelId,
      modelName,
    };
    try {
      const res = await fetch(
        initial?.id ? `/api/agents/${initial.id}` : "/api/agents",
        {
          method: initial?.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not save agent");
        setBusy(false);
        return;
      }
      router.push("/agents");
      router.refresh();
    } catch {
      setError("Network error");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {hasKey === false && (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          Add OpenRouter key to create agents and chat for real. You can still
          save a persona now; pick a model after the key is saved.
        </div>
      )}

      <label className="block space-y-2">
        <span className="text-[11px] uppercase tracking-[0.2em] text-ink-mist/80">
          Name
        </span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Night-shift reviewer"
          className="w-full rounded-xl border border-ink-line bg-ink-deep/80 px-3 py-2.5 text-ink-foam outline-none ring-coastal/40 placeholder:text-ink-mist/40 focus:ring-2"
        />
      </label>

      <label className="block space-y-2">
        <span className="text-[11px] uppercase tracking-[0.2em] text-ink-mist/80">
          Description / persona
        </span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={8}
          placeholder="This text is the system prompt. Describe who they are, how they think, and how they should answer."
          className="w-full resize-y rounded-xl border border-ink-line bg-ink-deep/80 px-3 py-2.5 text-sm leading-relaxed text-ink-foam outline-none ring-coastal/40 placeholder:text-ink-mist/40 focus:ring-2"
        />
      </label>

      <div className="space-y-2">
        <span className="text-[11px] uppercase tracking-[0.2em] text-ink-mist/80">
          Model
        </span>
        {modelsError && (
          <p className="text-sm text-ink-mist/80">{modelsError}</p>
        )}
        {models.length > 0 && (
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter models…"
            className="w-full rounded-xl border border-ink-line bg-ink-deep/80 px-3 py-2 text-sm text-ink-foam outline-none ring-coastal/40 placeholder:text-ink-mist/40 focus:ring-2"
          />
        )}
        <select
          value={modelId}
          onChange={(e) => onPickModel(e.target.value)}
          className="w-full rounded-xl border border-ink-line bg-ink-deep/80 px-3 py-2.5 text-sm text-ink-foam outline-none ring-coastal/40 focus:ring-2"
        >
          <option value="">
            {models.length ? "Select a chat model…" : "No models loaded"}
          </option>
          {visible.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} — {m.id}
            </option>
          ))}
          {modelId && !models.some((m) => m.id === modelId) && (
            <option value={modelId}>
              {modelName || modelId} — {modelId}
            </option>
          )}
        </select>
        {modelId && (
          <p className="text-xs text-ink-mist/70">
            Chat completions will use <code className="text-coastal">{modelId}</code>
            {modelName ? ` (${modelName})` : ""}.
          </p>
        )}
      </div>

      {error && (
        <p className="rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="rounded-xl bg-coastal px-4 py-2 text-sm font-semibold text-ink-deep hover:bg-coastal-bright disabled:opacity-40"
        >
          {initial?.id ? "Save agent" : "Create agent"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/agents")}
          className="rounded-xl border border-ink-line px-4 py-2 text-sm text-ink-mist hover:text-ink-foam"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
