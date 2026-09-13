import assert from "node:assert/strict";
import test from "node:test";

import { parseArgs } from "./parse-args.mjs";

test("parseArgs uses defaults", () => {
  assert.deepEqual(parseArgs([]), {
    directory: "atrium",
    branch: "main",
    skipDev: false,
    dryRun: false,
    help: false,
  });
});

test("parseArgs accepts a project directory", () => {
  assert.equal(parseArgs(["my-studio"]).directory, "my-studio");
  assert.equal(parseArgs(["."]).directory, ".");
});

test("parseArgs accepts flags", () => {
  assert.deepEqual(parseArgs(["studio", "--branch", "main", "--skip-dev", "--dry-run"]), {
    directory: "studio",
    branch: "main",
    skipDev: true,
    dryRun: true,
    help: false,
  });
});

test("parseArgs rejects unknown options", () => {
  assert.throws(() => parseArgs(["--wat"]), /Unknown option/);
});

test("parseArgs requires a branch value", () => {
  assert.throws(() => parseArgs(["--branch"]), /Missing value/);
});
