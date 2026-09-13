import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { PrismaClient } from "@prisma/client";
import { createTestDb } from "./test-db";
import {
  bootstrapDemo,
  buildDemoPrompts,
  demoListCommand,
  demoWorkspacePath,
  getDemoInfo,
  DEMO_AGENT_SLUG,
} from "./demo";
import { OPERATOR_HEADER } from "./operator-auth";

const testDb = createTestDb();

let demoGet: () => Promise<Response>;
let demoPost: (req: NextRequest) => Promise<Response>;
let ensureOperatorToken: () => Promise<string>;

before(async () => {
  ({ GET: demoGet, POST: demoPost } = await import("../app/api/demo/setup/route"));
  ({ ensureOperatorToken } = await import("./settings"));
});

function localDemoRequest(
  method: "GET" | "POST",
  token?: string
): NextRequest {
  const headers: Record<string, string> = {
    host: "localhost:3000",
    origin: "http://localhost:3000",
  };
  if (token) headers[OPERATOR_HEADER] = token;
  return new NextRequest("http://localhost:3000/api/demo/setup", {
    method,
    headers,
  });
}

test("getDemoInfo does not mutate settings", async () => {
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

  const cwd = path.join(testDb.dir, "repo-readonly");
  await mkdir(cwd, { recursive: true });

  const before = await prisma.settings.findUnique({ where: { id: "singleton" } });
  await getDemoInfo(cwd);
  const after = await prisma.settings.findUnique({ where: { id: "singleton" } });

  assert.equal(after?.enableShell, before?.enableShell);
  assert.equal(after?.allowedPaths, before?.allowedPaths);

  await prisma.$disconnect();
});

test("GET /api/demo/setup is read-only", async () => {
  const prisma = new PrismaClient();
  await prisma.settings.upsert({
    where: { id: "singleton" },
    update: { allowedPaths: "[]", enableShell: false },
    create: { id: "singleton", allowedPaths: "[]", enableShell: false },
  });
  await prisma.agent.upsert({
    where: { slug: DEMO_AGENT_SLUG },
    update: {},
    create: {
      slug: DEMO_AGENT_SLUG,
      name: "Launch Demo",
      title: "Demo",
      accent: "#000",
      description: "demo",
      modelId: "openai/gpt-4o-mini",
      modelName: "mini",
    },
  });

  const res = await demoGet();
  assert.equal(res.status, 200);

  const row = await prisma.settings.findUnique({ where: { id: "singleton" } });
  assert.equal(row?.enableShell, false);
  assert.equal(row?.allowedPaths, "[]");

  await prisma.$disconnect();
});

test("POST /api/demo/setup requires local operator session", async () => {
  const prisma = new PrismaClient();
  await prisma.settings.upsert({
    where: { id: "singleton" },
    update: { allowedPaths: "[]", enableShell: false },
    create: { id: "singleton", allowedPaths: "[]", enableShell: false },
  });
  await prisma.agent.upsert({
    where: { slug: DEMO_AGENT_SLUG },
    update: {},
    create: {
      slug: DEMO_AGENT_SLUG,
      name: "Launch Demo",
      title: "Demo",
      accent: "#000",
      description: "demo",
      modelId: "openai/gpt-4o-mini",
      modelName: "mini",
    },
  });

  const denied = await demoPost(localDemoRequest("POST"));
  assert.equal(denied.status, 403);

  const token = await ensureOperatorToken();
  const ok = await demoPost(localDemoRequest("POST", token));
  assert.equal(ok.status, 200);

  const row = await prisma.settings.findUnique({ where: { id: "singleton" } });
  assert.equal(row?.enableShell, true);

  await prisma.$disconnect();
});

test("bootstrapDemo grants demo-workspace and enables shell", async () => {
  const prisma = new PrismaClient();
  await prisma.settings.upsert({
    where: { id: "singleton" },
    update: { allowedPaths: "[]", enableShell: false },
    create: { id: "singleton", allowedPaths: "[]", enableShell: false },
  });
  await prisma.agent.upsert({
    where: { slug: DEMO_AGENT_SLUG },
    update: {},
    create: {
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

  const list = demoListCommand();
  assert.match(result.prompts.shell, new RegExp(list.command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  const workspaceStat = await stat(result.demoPath);
  assert.ok(workspaceStat.isDirectory());

  await prisma.$disconnect();
});

test("buildDemoPrompts uses platform shell listing command", () => {
  const prompts = buildDemoPrompts("/tmp/demo-workspace");
  const list = demoListCommand();
  assert.match(prompts.shell, new RegExp(list.command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test.after(() => {
  testDb.cleanup();
});
