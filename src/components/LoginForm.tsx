"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Login failed");
        setPending(false);
        return;
      }
      const next = params.get("next") || "/chat";
      router.replace(next);
      router.refresh();
    } catch {
      setError("Network error");
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="w-full max-w-sm space-y-5 rounded-3xl border border-ink-line/70 bg-ink-panel/70 p-8 shadow-[0_30px_80px_rgba(0,0,0,0.35)] backdrop-blur"
    >
      <div className="space-y-2">
        <div className="font-display text-2xl tracking-[0.12em] text-ink-foam">
          ATRIUM
        </div>
        <p className="text-sm leading-relaxed text-ink-mist">
          Kyaw Zaw Hein&apos;s multi-agent desk. Enter the studio password to
          continue.
        </p>
      </div>

      <label className="block space-y-2">
        <span className="text-[11px] uppercase tracking-[0.2em] text-ink-mist/80">
          Password
        </span>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-xl border border-ink-line bg-ink-deep/80 px-3 py-2.5 text-ink-foam outline-none ring-coastal/40 placeholder:text-ink-mist/40 focus:ring-2"
          placeholder="••••••••"
          autoComplete="current-password"
        />
      </label>

      {error && (
        <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || !password}
        className="w-full rounded-xl bg-coastal py-2.5 text-sm font-semibold text-ink-deep transition hover:bg-coastal-bright disabled:opacity-50"
      >
        {pending ? "Opening…" : "Enter Atrium"}
      </button>

      <p className="text-center text-[11px] text-ink-mist/60">
        Local demo default: <code className="text-ink-mist">atrium</code>
      </p>
    </form>
  );
}
