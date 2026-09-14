import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { createTestDb } from "./test-db";
import {
  executeMessageAgent,
  messageAgentDetail,
  resolveTargetAgent,
  type RunAgentBrief,
} from "./message-agent-tool";
import { getToolDefinitionNames } from "./llm";

const testDb = createTestDb();

after(() => {
  testDb.cleanup();
});

async function seedAgents() {
  const { prisma } = await import("./prisma");
  const a = await prisma.agent.create({
    data: {
      slug: "agent-a",
      name: "Agent Alpha",
      description: "Persona A",
      modelId: "openai/gpt-4o-mini",
      modelName: "Mini",
    },
  });
  const b = await prisma.agent.create({
    data: {
      slug: "agent-b",
      name: "Agent Beta",
      description: "Persona B — design specialist",
      modelId: "anthropic/claude-3.5-sonnet",
      modelName: "Claude",
    },
  });
  return { a, b };
}

before(async () => {
  await seedAgents();
});

test("happy path: brief is delivered to target agent voice", async () => {
  let captured: { targetSlug: string; brief: string } | null = null;
  const runBrief: RunAgentBrief = async (target, brief) => {
    captured = { targetSlug: target.slug, brief };
    return { content: "Beta says: use more whitespace." };
  };

  const result = await executeMessageAgent(
    { agent: "agent-b", brief: "Review this hero layout." },
    { fromAgent: { name: "Agent Alpha", slug: "agent-a", description: "Persona A" } },
    runBrief
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.agent, "Agent Beta");
    assert.equal(result.slug, "agent-b");
    assert.match(result.reply, /whitespace/);
  }
  assert.deepEqual(captured, {
    targetSlug: "agent-b",
    brief: "Review this hero layout.",
  });
  assert.match(messageAgentDetail(result), /→ Agent Beta/);
});

test("refuses unknown agent", async () => {
  const result = await executeMessageAgent(
    { agent: "no-such-agent", brief: "hello" },
    { fromAgent: { name: "Agent Alpha", slug: "agent-a", description: "" } },
    async () => ({ content: "nope" })
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "unknown_agent");
    assert.match(result.error, /No agent matches/);
  }
});

test("refuses messaging self", async () => {
  const result = await executeMessageAgent(
    { agent: "agent-a", brief: "talk to myself" },
    { fromAgent: { name: "Agent Alpha", slug: "agent-a", description: "" } },
    async () => ({ content: "should not run" })
  );

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "self");
});

test("resolveTargetAgent matches slug, id, or name", async () => {
  const { prisma } = await import("./prisma");
  const b = await prisma.agent.findUniqueOrThrow({ where: { slug: "agent-b" } });

  assert.equal((await resolveTargetAgent("agent-b"))?.slug, "agent-b");
  assert.equal((await resolveTargetAgent(b.id))?.slug, "agent-b");
  assert.equal((await resolveTargetAgent("Agent Beta"))?.slug, "agent-b");
});

test("nested agent run does not expose message_agent (no chain inheritance)", () => {
  const callerTools = getToolDefinitionNames({
    fsGranted: false,
    shellGranted: false,
    messageAgentEnabled: true,
  });
  assert.ok(callerTools.includes("message_agent"));
  assert.ok(!callerTools.includes("read_file"));

  const calleeTools = getToolDefinitionNames({
    fsGranted: true,
    shellGranted: true,
    messageAgentEnabled: false,
  });
  assert.ok(!calleeTools.includes("message_agent"));
  assert.ok(calleeTools.includes("read_file"));
  assert.ok(calleeTools.includes("run_shell"));
});

test("message_agent result does not leak tool grants to caller", async () => {
  const { prisma } = await import("./prisma");
  await prisma.settings.upsert({
    where: { id: "singleton" },
    update: { allowedPaths: JSON.stringify(["/tmp/atrium-secret"]) },
    create: {
      id: "singleton",
      allowedPaths: JSON.stringify(["/tmp/atrium-secret"]),
    },
  });

  const result = await executeMessageAgent(
    { agent: "Agent Beta", brief: "ping" },
    { fromAgent: { name: "Agent Alpha", slug: "agent-a", description: "" } },
    async () => ({ content: "pong" })
  );

  assert.equal(result.ok, true);
  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes("allowedPaths"));
  assert.ok(!serialized.includes("atrium-secret"));
  assert.ok(!("toolsGranted" in (result as object)));
});
