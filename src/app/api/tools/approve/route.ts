/**
 * Operator approve/deny for pending run_shell mutations.
 * WHY: Mutating shell stays blocked until a human confirms. Requires same-origin
 * operator proof (httpOnly cookie) and durable pending rows in SQLite.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireOperatorProof } from "@/lib/operator-auth";
import { resolveShellApproval } from "@/lib/shell-tools";

export async function POST(req: NextRequest) {
  const auth = await requireOperatorProof(req);
  if (!auth.ok) {
    const message =
      auth.error === "forbidden_origin"
        ? "Cross-origin shell approval is not allowed."
        : "Operator proof required.";
    return NextResponse.json({ error: message }, { status: auth.status });
  }

  let body: { approvalId?: string; allow?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const approvalId = body.approvalId?.trim() || "";
  if (!approvalId) {
    return NextResponse.json({ error: "approvalId required" }, { status: 400 });
  }
  if (typeof body.allow !== "boolean") {
    return NextResponse.json({ error: "allow must be boolean" }, { status: 400 });
  }

  const result = await resolveShellApproval(approvalId, body.allow);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  return NextResponse.json(result);
}
