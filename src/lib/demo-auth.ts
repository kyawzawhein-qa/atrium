/**
 * Demo bootstrap is POST-only and bound to the local operator session.
 *
 * WHY: POST /api/demo/setup grants demo-workspace and enables shell. That must
 * not be callable by arbitrary LAN clients or CSRF/prefetch GETs. Same-origin
 * + operator cookie (see operator-auth.ts) proves the browser session that
 * opened Atrium. Host must be localhost unless ATRIUM_DEMO_SETUP=1 is set
 * explicitly for non-localhost dev binds.
 */

import type { NextRequest } from "next/server";
import {
  isSameOriginRequest,
  requestHost,
  verifyOperatorProof,
} from "./operator-auth";

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export function isLocalHostRequest(req: NextRequest): boolean {
  const host = requestHost(req);
  if (!host) return false;
  const hostname = host.split(":")[0]?.toLowerCase() ?? "";
  return LOCAL_HOSTNAMES.has(hostname);
}

/** Explicit opt-in when dev server is bound beyond localhost. */
export function isDemoSetupEnvEnabled(): boolean {
  return process.env.ATRIUM_DEMO_SETUP === "1";
}

export type DemoAuthFailure = {
  ok: false;
  status: 403;
  error: "forbidden_origin" | "forbidden_operator" | "demo_local_only";
};

export async function requireDemoSetupAuth(
  req: NextRequest
): Promise<{ ok: true } | DemoAuthFailure> {
  if (!isSameOriginRequest(req)) {
    return { ok: false, status: 403, error: "forbidden_origin" };
  }
  if (!(await verifyOperatorProof(req))) {
    return { ok: false, status: 403, error: "forbidden_operator" };
  }
  if (!isLocalHostRequest(req) && !isDemoSetupEnvEnabled()) {
    return { ok: false, status: 403, error: "demo_local_only" };
  }
  return { ok: true };
}
