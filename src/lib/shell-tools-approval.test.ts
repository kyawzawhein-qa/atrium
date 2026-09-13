import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { createTestDb } from "./test-db";

const testDb = createTestDb();

type ApprovePost = (
  req: NextRequest
) => Promise<Response>;

let approvePost: ApprovePost;
let OPERATOR_HEADER: string;
let isSameOriginRequest: (req: NextRequest) => boolean;
let createStoredApproval: (
  id: string,
  command: string,
  cwd: string,
  expiresAt: Date
) => Promise<void>;
let resolveShellApproval: (
  approvalId: string,
  allow: boolean
) => Promise<{
  ok: boolean;
  allowed?: boolean;
  result?: { ok: boolean; stdout?: string };
}>;
let ensureOperatorToken: () => Promise<string>;
let SETTINGS_ID: string;
let prisma: typeof import("./prisma").prisma;

let workDir: string;

before(async () => {
  ({ POST: approvePost } = await import("../app/api/tools/approve/route"));
  const auth = await import("./operator-auth");
  OPERATOR_HEADER = auth.OPERATOR_HEADER;
  isSameOriginRequest = auth.isSameOriginRequest;
  ({ createStoredApproval } = await import("./shell-approval-store"));
  ({ resolveShellApproval } = await import("./shell-tools"));
  ({ ensureOperatorToken, SETTINGS_ID } = await import("./settings"));
  ({ prisma } = await import("./prisma"));

  workDir = await mkdtemp(path.join(os.tmpdir(), "atrium-shell-"));
  await prisma.settings.upsert({
    where: { id: SETTINGS_ID },
    update: {
      allowedPaths: JSON.stringify([workDir]),
      enableShell: true,
    },
    create: {
      id: SETTINGS_ID,
      allowedPaths: JSON.stringify([workDir]),
      enableShell: true,
    },
  });
});

after(() => {
  testDb.cleanup();
});

function approveRequest(
  body: { approvalId: string; allow: boolean },
  token?: string
) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    origin: "http://localhost:3000",
    host: "localhost:3000",
  };
  if (token) headers[OPERATOR_HEADER] = token;
  return new NextRequest("http://localhost:3000/api/tools/approve", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

test("approve route returns 403 without operator proof", async () => {
  await ensureOperatorToken();
  const id = "noauth1";
  await createStoredApproval(
    id,
    "echo blocked",
    workDir,
    new Date(Date.now() + 60_000)
  );

  const res = await approvePost(
    approveRequest({ approvalId: id, allow: true })
  );
  assert.equal(res.status, 403);
});

test("approve route returns 403 for cross-origin caller", async () => {
  const token = await ensureOperatorToken();
  const id = "xorig1";
  await createStoredApproval(
    id,
    "echo blocked",
    workDir,
    new Date(Date.now() + 60_000)
  );

  const req = new NextRequest("http://localhost:3000/api/tools/approve", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://evil.example",
      host: "localhost:3000",
      [OPERATOR_HEADER]: token,
    },
    body: JSON.stringify({ approvalId: id, allow: true }),
  });
  assert.equal(isSameOriginRequest(req), false);

  const res = await approvePost(req);
  assert.equal(res.status, 403);
});

test("deny marks approval denied without executing", async () => {
  const token = await ensureOperatorToken();
  const id = "deny-route-1";
  await createStoredApproval(
    id,
    `touch ${path.join(workDir, "should-not-exist.txt")}`,
    workDir,
    new Date(Date.now() + 60_000)
  );

  const res = await approvePost(
    approveRequest({ approvalId: id, allow: false }, token)
  );
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.equal(data.allowed, false);

  const again = await approvePost(
    approveRequest({ approvalId: id, allow: true }, token)
  );
  assert.equal(again.status, 404);
});

test("resolveShellApproval executes after restart without in-memory waiter", async () => {
  const id = "restart1";
  await createStoredApproval(
    id,
    "echo atrium-restart-ok",
    workDir,
    new Date(Date.now() + 60_000)
  );

  const result = await resolveShellApproval(id, true);
  assert.equal(result.ok, true);
  if (!result.ok || !result.allowed) return;
  assert.equal(result.result?.ok, true);
  if (result.result?.ok) {
    assert.match(result.result.stdout ?? "", /atrium-restart-ok/);
  }
});
