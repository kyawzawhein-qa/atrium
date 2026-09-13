import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  directoryIsUsable,
  resolveLocalSourceDir,
  shouldSkipPath,
  tarballUrl,
} from "./bootstrap.mjs";

test("tarballUrl points at the GitHub codeload archive", () => {
  assert.equal(
    tarballUrl("main"),
    "https://codeload.github.com/kyawzawhein-qa/atrium/tar.gz/refs/heads/main",
  );
});

test("directoryIsUsable accepts missing directories", async () => {
  const dir = path.join(tmpdir(), `create-atrium-missing-${Date.now()}`);
  assert.equal(await directoryIsUsable(dir), true);
});

test("directoryIsUsable rejects non-empty directories", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "create-atrium-full-"));
  await writeFile(path.join(dir, "keep.txt"), "x", "utf8");
  assert.equal(await directoryIsUsable(dir), false);
});

test("shouldSkipPath ignores local artifacts and secrets", () => {
  assert.equal(shouldSkipPath("node_modules"), true);
  assert.equal(shouldSkipPath(".env"), true);
  assert.equal(shouldSkipPath("dev.db"), true);
  assert.equal(shouldSkipPath("README.md"), false);
});

test("resolveLocalSourceDir finds the parent Atrium repo", async () => {
  const repoRoot = path.resolve(import.meta.dirname, "..");
  const source = await resolveLocalSourceDir(path.join(repoRoot, "create-atrium"));
  assert.equal(source, repoRoot);
});
