/**
 * Issue the httpOnly operator cookie for same-origin shell approvals.
 * WHY: Zero-login UX — opening the studio bootstraps operator proof once.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  OPERATOR_COOKIE,
  isSameOriginRequest,
  verifyOperatorProof,
} from "@/lib/operator-auth";
import { ensureOperatorToken } from "@/lib/settings";

export async function GET(req: NextRequest) {
  if (!isSameOriginRequest(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const token = await ensureOperatorToken();
  const res = NextResponse.json({ ok: true });

  if (!(await verifyOperatorProof(req))) {
    res.cookies.set(OPERATOR_COOKIE, token, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
  }

  return res;
}
