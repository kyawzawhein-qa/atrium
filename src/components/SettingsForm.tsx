"use client";

import { FormEvent, useEffect, useState } from "react";

type PublicSettings = {
  hasKey: boolean;
  keyMasked: string;
  allowedPaths: string[];
  enableShell: boolean;
};

export function SettingsForm() {
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [keyDraft, setKeyDraft] = useState("");
  const [pathDraft, setPathDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/settings");
    if (!res.ok) return;
    const data = await res.json();
    setSettings(data.settings);
  }

  useEffect(() => {
    void load();
  }, []);

  async function patch(body: Record<string, unknown>, okMessage: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Update failed");
        return;
      }
      setSettings(data.settings);
      setNotice(okMessage);
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  async function saveKey(e: FormEvent) {
    e.preventDefault();
    if (!keyDraft.trim()) return;
    await patch({ openrouterApiKey: keyDraft.trim() }, "API key saved. It is stored only in this studio’s database.");
    setKeyDraft("");
  }

  async function addPath(e: FormEvent) {
    e.preventDefault();
    if (!pathDraft.trim()) return;
    await patch({ addPath: pathDraft.trim() }, "Path granted.");
    setPathDraft("");
  }

  if (!settings) {
    return <p className="text-sm text-ink-mist">Loading settings…</p>;
  }

  return (
    <div className="space-y-10">
      {!settings.hasKey && (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          Add OpenRouter key to create agents and chat for real.
        </div>
      )}

      <section className="space-y-4 rounded-3xl border border-ink-line/60 bg-ink-panel/50 p-6">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-ink-mist">
            OpenRouter API key
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-mist/80">
            Paste a key from{" "}
            <a
              href="https://openrouter.ai/keys"
              target="_blank"
              rel="noreferrer"
              className="text-coastal underline-offset-2 hover:underline"
            >
              openrouter.ai/keys
            </a>
            . It is stored in SQLite on this machine and never committed. After
            save, only a masked preview is shown.
          </p>
        </div>

        {settings.hasKey && (
          <div className="rounded-xl border border-ink-line/70 bg-ink-deep/60 px-3 py-2 font-mono text-sm text-ink-foam">
            {settings.keyMasked}
          </div>
        )}

        <form onSubmit={saveKey} className="space-y-3">
          <label className="block space-y-2">
            <span className="text-[11px] uppercase tracking-[0.2em] text-ink-mist/80">
              {settings.hasKey ? "Replace key" : "API key"}
            </span>
            <input
              type="password"
              autoComplete="off"
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
              placeholder={settings.hasKey ? "Paste a new key to replace" : "sk-or-…"}
              className="w-full rounded-xl border border-ink-line bg-ink-deep/80 px-3 py-2.5 text-ink-foam outline-none ring-coastal/40 placeholder:text-ink-mist/40 focus:ring-2"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={busy || !keyDraft.trim()}
              className="rounded-xl bg-coastal px-4 py-2 text-sm font-semibold text-ink-deep hover:bg-coastal-bright disabled:opacity-40"
            >
              {settings.hasKey ? "Replace key" : "Save key"}
            </button>
            {settings.hasKey && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void patch({ clearKey: true }, "API key removed.")}
                className="rounded-xl border border-ink-line px-4 py-2 text-sm text-ink-mist hover:text-ink-foam disabled:opacity-40"
              >
                Remove key
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="space-y-4 rounded-3xl border border-ink-line/60 bg-ink-panel/50 p-6">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-ink-mist">
            Computer path allowlist
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-mist/80">
            Grant Atrium absolute folders on{" "}
            <strong className="font-medium text-ink-foam">the machine running this server</strong>
            , not the browser. Agents may <code className="text-coastal">list_dir</code>,{" "}
            <code className="text-coastal">read_file</code>,{" "}
            <code className="text-coastal">write_file</code>, and{" "}
            <code className="text-coastal">edit_file</code> only inside this list. Empty
            list means those tools stay not granted.
          </p>
        </div>

        {settings.allowedPaths.length === 0 ? (
          <p className="text-sm text-ink-mist/70">No paths granted yet.</p>
        ) : (
          <ul className="space-y-2">
            {settings.allowedPaths.map((p) => (
              <li
                key={p}
                className="flex items-center justify-between gap-3 rounded-xl border border-ink-line/70 bg-ink-deep/50 px-3 py-2"
              >
                <code className="min-w-0 truncate text-sm text-ink-foam">{p}</code>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void patch({ removePath: p }, "Path removed.")}
                  className="shrink-0 text-xs text-ink-mist hover:text-rose-300"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={addPath} className="flex flex-col gap-2 sm:flex-row">
          <input
            value={pathDraft}
            onChange={(e) => setPathDraft(e.target.value)}
            placeholder="/home/you/project or C:/Users/you/Documents"
            className="min-w-0 flex-1 rounded-xl border border-ink-line bg-ink-deep/80 px-3 py-2.5 text-sm text-ink-foam outline-none ring-coastal/40 placeholder:text-ink-mist/40 focus:ring-2"
          />
          <button
            type="submit"
            disabled={busy || !pathDraft.trim()}
            className="rounded-xl bg-coastal px-4 py-2 text-sm font-semibold text-ink-deep hover:bg-coastal-bright disabled:opacity-40"
          >
            Add path
          </button>
        </form>
      </section>

      <section className="space-y-4 rounded-3xl border border-ink-line/60 bg-ink-panel/50 p-6">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-ink-mist">
            Shell access
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-mist/80">
            When enabled, agents may call <code className="text-coastal">run_shell</code>{" "}
            with cwd inside a granted folder. Read-ish commands run immediately;
            every command asks for Approve /
            Deny in the chat. Dangerous patterns are always rejected. Requires a
            non-empty allowlist.
          </p>
        </div>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-ink-line/70 bg-ink-deep/50 px-4 py-3">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 accent-[var(--coastal,#5b8a9a)]"
            checked={settings.enableShell}
            disabled={busy}
            onChange={(e) =>
              void patch(
                { enableShell: e.target.checked },
                e.target.checked
                  ? "Shell enabled in granted folders."
                  : "Shell disabled."
              )
            }
          />
          <span>
            <span className="block text-sm font-medium text-ink-foam">
              Allow shell in granted folders
            </span>
            <span className="mt-1 block text-xs text-ink-mist/70">
              Default off. Local-first — commands run on this server, not in your browser.
            </span>
          </span>
        </label>
      </section>

      {error && (
        <p className="rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-xl bg-coastal/10 px-3 py-2 text-sm text-coastal-bright">
          {notice}
        </p>
      )}
    </div>
  );
}
