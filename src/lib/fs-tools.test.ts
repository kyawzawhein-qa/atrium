import { mkdtemp, writeFile, symlink, rm, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveIfAllowed } from "./fs-tools";

test("rejects relative paths", async () => {
  const r = await resolveIfAllowed("etc/passwd", [path.resolve("/tmp")]);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, "invalid");
});

test("rejects sibling prefix", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "atrium-a-"));
  const sibling = root + "2";
  await mkdir(sibling, { recursive: true });
  const secret = path.join(sibling, "secret.txt");
  await writeFile(secret, "nope");
  const r = await resolveIfAllowed(secret, [root]);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, "outside_allowlist");
  await rm(root, { recursive: true, force: true });
  await rm(sibling, { recursive: true, force: true });
});

test("rejects symlink hop outside allowlist", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "atrium-s-"));
  const outside = await mkdtemp(path.join(os.tmpdir(), "atrium-o-"));
  const secret = path.join(outside, "secret.txt");
  await writeFile(secret, "leaked");
  const link = path.join(root, "hop.txt");
  await symlink(secret, link);
  const r = await resolveIfAllowed(link, [root]);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, "outside_allowlist");
  await rm(root, { recursive: true, force: true });
  await rm(outside, { recursive: true, force: true });
});

test("allows a real file inside the grant", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "atrium-ok-"));
  const file = path.join(root, "ok.txt");
  await writeFile(file, "yes");
  const r = await resolveIfAllowed(file, [root]);
  assert.equal(r.ok, true);
  await rm(root, { recursive: true, force: true });
});
