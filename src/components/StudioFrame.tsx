"use client";

import type { ReactNode } from "react";
import Link from "next/link";

export function StudioFrame({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-ink-deep text-ink-foam">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(91,138,154,0.12),_transparent_55%),radial-gradient(ellipse_at_bottom_right,_rgba(196,165,116,0.08),_transparent_40%)]" />
      <header className="relative flex items-center justify-between gap-3 border-b border-ink-line/60 px-5 py-4">
        <div className="flex items-center gap-4">
          <Link
            href="/chat"
            className="font-display text-lg tracking-[0.08em] text-ink-foam"
          >
            ATRIUM
          </Link>
          <span className="hidden text-[11px] uppercase tracking-[0.2em] text-ink-mist/70 sm:inline">
            Multi-agent desk
          </span>
        </div>
        <nav className="flex items-center gap-2 text-xs">
          <Link
            href="/chat"
            className="rounded-lg border border-ink-line/80 px-2.5 py-1.5 text-ink-mist hover:text-ink-foam"
          >
            Chat
          </Link>
          <Link
            href="/agents"
            className="rounded-lg border border-ink-line/80 px-2.5 py-1.5 text-ink-mist hover:text-ink-foam"
          >
            Agents
          </Link>
          <Link
            href="/settings"
            className="rounded-lg border border-ink-line/80 px-2.5 py-1.5 text-ink-mist hover:text-ink-foam"
          >
            Settings
          </Link>
        </nav>
      </header>
      <main className="relative mx-auto w-full max-w-3xl px-5 py-10">
        <h1 className="font-display text-2xl tracking-[0.06em] text-ink-foam">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-2 text-sm leading-relaxed text-ink-mist">{subtitle}</p>
        )}
        <div className="mt-8">{children}</div>
      </main>
    </div>
  );
}
