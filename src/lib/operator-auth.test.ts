import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { createTestDb } from "./test-db";

const testDb = createTestDb();

let OPERATOR_COOKIE: string;
let OPERATOR_HEADER: string;
let isSameOriginRequest: (req: NextRequest) => boolean;
let verifyOperatorProof: (req: NextRequest) => Promise<boolean>;
let ensureOperatorToken: () => Promise<string>;

before(async () => {
  const auth = await import("./operator-auth");
  OPERATOR_COOKIE = auth.OPERATOR_COOKIE;
  OPERATOR_HEADER = auth.OPERATOR_HEADER;
  isSameOriginRequest = auth.isSameOriginRequest;
  verifyOperatorProof = auth.verifyOperatorProof;
  ({ ensureOperatorToken } = await import("./settings"));
});

after(() => {
  testDb.cleanup();
});

function req(
  url: string,
  init?: RequestInit & { host?: string }
): NextRequest {
  const { host, headers: rawHeaders, ...rest } = init ?? {};
  const headers = new Headers(rawHeaders);
  if (host) headers.set("host", host);
  return new NextRequest(url, { ...rest, headers });
}

test("same-origin when Origin matches Host", () => {
  const r = req("http://localhost:3000/api/tools/approve", {
    method: "POST",
    host: "localhost:3000",
    headers: { origin: "http://localhost:3000" },
  });
  assert.equal(isSameOriginRequest(r), true);
});

test("rejects cross-origin Origin", () => {
  const r = req("http://localhost:3000/api/tools/approve", {
    method: "POST",
    host: "localhost:3000",
    headers: { origin: "https://evil.example" },
  });
  assert.equal(isSameOriginRequest(r), false);
});

test("rejects requests with no origin proof", () => {
  const r = req("http://localhost:3000/api/tools/approve", {
    method: "POST",
    host: "localhost:3000",
  });
  assert.equal(isSameOriginRequest(r), false);
});

test("verifyOperatorProof accepts cookie on same-origin request", async () => {
  const token = await ensureOperatorToken();
  const r = req("http://localhost:3000/api/tools/approve", {
    method: "POST",
    host: "localhost:3000",
    headers: {
      origin: "http://localhost:3000",
      cookie: `${OPERATOR_COOKIE}=${token}`,
    },
  });
  assert.equal(await verifyOperatorProof(r), true);
});

test("verifyOperatorProof rejects missing operator proof", async () => {
  await ensureOperatorToken();
  const r = req("http://localhost:3000/api/tools/approve", {
    method: "POST",
    host: "localhost:3000",
    headers: { origin: "http://localhost:3000" },
  });
  assert.equal(await verifyOperatorProof(r), false);
});

test("verifyOperatorProof accepts header in tests", async () => {
  const token = await ensureOperatorToken();
  const r = req("http://localhost:3000/api/tools/approve", {
    method: "POST",
    host: "localhost:3000",
    headers: {
      origin: "http://localhost:3000",
      [OPERATOR_HEADER]: token,
    },
  });
  assert.equal(await verifyOperatorProof(r), true);
});

test("verifyOperatorProof rejects cross-origin even with token header", async () => {
  const token = await ensureOperatorToken();
  const r = req("http://localhost:3000/api/tools/approve", {
    method: "POST",
    host: "localhost:3000",
    headers: {
      origin: "https://evil.example",
      [OPERATOR_HEADER]: token,
    },
  });
  assert.equal(await verifyOperatorProof(r), false);
});
