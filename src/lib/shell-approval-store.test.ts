import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { createTestDb } from "./test-db";

const testDb = createTestDb();

let createStoredApproval: (
  id: string,
  command: string,
  cwd: string,
  expiresAt: Date
) => Promise<void>;
let getStoredPendingApproval: (
  id: string
) => Promise<{ command: string; cwd: string; status: string } | null>;
let markStoredApproval: (
  id: string,
  status: "approved" | "denied" | "expired" | "completed"
) => Promise<void>;
let purgeExpiredApprovals: () => Promise<number>;

before(async () => {
  const store = await import("./shell-approval-store");
  createStoredApproval = store.createStoredApproval;
  getStoredPendingApproval = store.getStoredPendingApproval;
  markStoredApproval = store.markStoredApproval;
  purgeExpiredApprovals = store.purgeExpiredApprovals;
});

after(() => {
  testDb.cleanup();
});

test("pending approval round-trips from SQLite", async () => {
  const id = "abc123";
  const expiresAt = new Date(Date.now() + 60_000);
  await createStoredApproval(id, "echo hi", "/tmp", expiresAt);

  const row = await getStoredPendingApproval(id);
  assert.ok(row);
  assert.equal(row.command, "echo hi");
  assert.equal(row.cwd, "/tmp");
  assert.equal(row.status, "pending");
});

test("denied approval is no longer pending", async () => {
  const id = "deny1";
  await createStoredApproval(
    id,
    "touch x",
    "/tmp",
    new Date(Date.now() + 60_000)
  );
  await markStoredApproval(id, "denied");
  assert.equal(await getStoredPendingApproval(id), null);
});

test("expired pending rows are purged", async () => {
  const id = "old1";
  await createStoredApproval(
    id,
    "ls",
    "/tmp",
    new Date(Date.now() - 1_000)
  );
  const count = await purgeExpiredApprovals();
  assert.equal(count, 1);
  assert.equal(await getStoredPendingApproval(id), null);
});
