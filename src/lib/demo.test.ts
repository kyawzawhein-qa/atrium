import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { createTestDb } from "./test-db";
import { bootstrapDemo, DEMO_AGENT_SLUG, demoWorkspacePath } from "./demo";

const testDb = createTestDb();

test("bootstrapDemo grants demo-workspace and enables shell", async () => {
  const prisma = new PrismaClient();
  await prisma.settings.create({
    data: { id: "singleton", allowedPaths: "[]", enableShell: false },
  });
  await prisma.agent.create({
    data: {
      slug: DEMO_AGENT_SLUG,
      name: "Launch Demo",
      title: "Demo",
      accent: "#000",
      description: "demo",
      modelId: "openai/gpt-4o-mini",
      modelName: "mini",
    },
  });

  const cwd = path.join(testDb.dir, "repo");
  await mkdir(cwd, { recursive: true });
  const result = await bootstrapDemo(cwd);

  assert.equal(result.agentSlug, DEMO_AGENT_SLUG);
  assert.equal(result.settings.enableShell, true);
  assert.ok(result.settings.allowedPaths.includes(result.demoPath));
  assert.equal(result.demoPath, demoWorkspacePath(cwd));
  assert.match(result.prompts.writeFile, /write_file/);
  assert.match(result.prompts.shell, /run_shell/);

  const workspaceStat = await stat(result.demoPath);
  assert.ok(workspaceStat.isDirectory());

  await prisma.$disconnect();
});

test.after(() => {
  testDb.cleanup();
});
