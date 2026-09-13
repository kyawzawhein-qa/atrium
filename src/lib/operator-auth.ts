/**
 * Same-origin operator proof for sensitive local actions (shell approve/deny).
 *
 * WHY: Atrium has no login. Anyone on the LAN who can reach the host can use
 * the studio, but cross-origin sites and unauthenticated API callers must not
 * be able to approve shell commands. A per-install operator token (SQLite) is
 * issued as an httpOnly SameSite=Strict cookie when the operator opens the
 * app; approve requests must be same-origin and present that cookie (or header
 * in tests).
 */

import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { ensureOperatorToken } from "./settings";

export const OPERATOR_COOKIE = "atrium_operator";
export const OPERATOR_HEADER = "x-atrium-operator";

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/** Request host from Next.js (may include port). */
export function requestHost(req: NextRequest): string | null {
  return req.headers.get("host")?.split(",")[0]?.trim() || null;
}

/**
 * Reject cross-origin POSTs. Requires Origin or Referer to match Host.
 * Direct curl without those headers is treated as unauthenticated.
 */
export function isSameOriginRequest(req: NextRequest): boolean {
  const host = requestHost(req);
  if (!host) return false;

  const secFetchSite = req.headers.get("sec-fetch-site");
  if (secFetchSite === "same-origin") return true;

  const origin = req.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }

  const referer = req.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).host === host;
    } catch {
      return false;
    }
  }

  return false;
}

export async function verifyOperatorProof(req: NextRequest): Promise<boolean> {
  if (!isSameOriginRequest(req)) return false;

  const expected = await ensureOperatorToken();
  const cookie = req.cookies.get(OPERATOR_COOKIE)?.value;
  const header = req.headers.get(OPERATOR_HEADER);
  const presented = cookie || header;
  if (!presented) return false;

  return safeEqual(presented, expected);
}

export type OperatorAuthFailure =
  | { ok: false; status: 403; error: "forbidden_origin" | "forbidden_operator" };

export async function requireOperatorProof(
  req: NextRequest
): Promise<{ ok: true } | OperatorAuthFailure> {
  if (!isSameOriginRequest(req)) {
    return { ok: false, status: 403, error: "forbidden_origin" };
  }
  if (!(await verifyOperatorProof(req))) {
    return { ok: false, status: 403, error: "forbidden_operator" };
  }
  return { ok: true };
}
