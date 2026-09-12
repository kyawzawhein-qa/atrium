import { Suspense } from "react";
import { LoginForm } from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-ink-deep px-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(126,182,176,0.18),transparent_40%),radial-gradient(circle_at_80%_70%,rgba(138,123,184,0.12),transparent_35%),linear-gradient(160deg,#0c1216,#101820_50%,#0c1216)]" />
      <div className="pointer-events-none absolute -left-24 top-24 h-64 w-64 rounded-full border border-ink-line/40" />
      <div className="pointer-events-none absolute -right-16 bottom-20 h-48 w-48 rounded-full border border-coastal/20" />
      <Suspense fallback={<div className="text-ink-mist">Loading…</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
