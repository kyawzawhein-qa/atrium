import { NextRequest, NextResponse } from "next/server";
import { bootstrapDemo, getDemoInfo } from "@/lib/demo";
import { requireDemoSetupAuth } from "@/lib/demo-auth";

/** Read-only: returns demo paths/prompts without mutating Settings (safe for GET). */
export async function GET() {
  try {
    const info = await getDemoInfo();
    if (!info.agentId) {
      return NextResponse.json(
        { error: `Demo agent not found. Run npm run db:seed.` },
        { status: 404 }
      );
    }
    return NextResponse.json(info);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Demo info failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Mutates Settings (allowlist + shell). POST-only; local operator session required. */
export async function POST(req: NextRequest) {
  const auth = await requireDemoSetupAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const result = await bootstrapDemo();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Demo setup failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
