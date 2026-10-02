import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { createTestDb } from "./test-db";
import {
  executeMessageAgent,
  type RunAgentBrief,
  type AgentMessageChainContext,
} from "./message-agent-tool";
import {
  waitForAgentMessageDispatch,
  setAgentMessageReceiverRunnerForTests,
} from "./agent-message-dispatcher";
import { prisma } from "./prisma";

const testDb = createTestDb();

after(() => {
  testDb.cleanup();
});

before(async () => {
  await prisma.agent.createMany({
    data: [
      {
        slug: "agent-a",
        name: "Agent Alpha",
        description: "A",
        modelId: "openai/gpt-4o-mini",
        modelName: "Mini",
      },
      {
        slug: "agent-b",
        name: "Agent Beta",
        description: "B",
        modelId: "openai/gpt-4o-mini",
        modelName: "Mini",
      },
      {
        slug: "agent-c",
        name: "Agent Gamma",
        description: "C",
        modelId: "openai/gpt-4o-mini",
        modelName: "Mini",
      },
    ],
  });
});

const fromA = { name: "Agent Alpha", slug: "agent-a", description: "A" };

test("async enqueue returns messageId and dispatch completes with agent_reply", async () => {
  setAgentMessageReceiverRunnerForTests(async () => ({ content: "Async reply body" }));
  const thread = await prisma.thread.create({
    data: {
      title: "t",
      agentId: (await prisma.agent.findUniqueOrThrow({ where: { slug: "agent-a" } })).id,
    },
  });

  const runBrief: RunAgentBrief = async () => ({ content: "Async reply body" });

  const result = await executeMessageAgent(
    { agent: "agent-b", brief: "hello async" },
    { fromAgent: fromA, senderThreadId: thread.id },
    runBrief
  );

  assert.equal(result.ok, true);
  if (!result.ok || !("queued" in result)) throw new Error("expected queued");
  assert.equal(result.queued, true);
  assert.ok(result.messageId);

  await waitForAgentMessageDispatch(result.messageId);

  const row = await prisma.agentMessage.findUniqueOrThrow({ where: { id: result.messageId } });
  assert.equal(row.status, "done");
  assert.match(row.reply ?? "", /Async reply/);

  const replies = await prisma.message.findMany({
    where: { threadId: thread.id, role: "agent_reply" },
  });
  assert.equal(replies.length, 1);
  assert.match(replies[0].content, /Agent Beta/);
  setAgentMessageReceiverRunnerForTests(null);
});

test("wait:true preserves synchronous reply shape", async () => {
  const runBrief: RunAgentBrief = async () => ({ content: "sync ok" });
  const result = await executeMessageAgent(
    { agent: "agent-b", brief: "sync", wait: true },
    { fromAgent: fromA },
    runBrief
  );
  assert.equal(result.ok, true);
  if (!result.ok || !("reply" in result)) throw new Error("expected sync");
  assert.equal(result.slug, "agent-b");
  assert.equal(result.reply, "sync ok");
  assert.ok(!("queued" in result));
});

test("A→B→C chain within hop limit", async () => {
  const calls: string[] = [];
  const runBrief: RunAgentBrief = async (target, brief, chain) => {
    calls.push(`${target.slug}:${chain.hopCount}`);
    if (target.slug === "agent-b" && brief.includes("chain-step-2")) {
      await executeMessageAgent(
        { agent: "agent-c", brief: "chain-step-3", wait: true },
        {
          fromAgent: { name: "B", slug: "agent-b", description: "" },
          chain,
          inboundAgentMessageId: "synthetic-parent",
        },
        runBrief
      );
      return { content: "B forwarded to C" };
    }
    if (target.slug === "agent-c") return { content: "C done" };
    return { content: "B only" };
  };

  const first = await executeMessageAgent(
    { agent: "agent-b", brief: "chain-step-2", wait: true },
    { fromAgent: fromA },
    runBrief
  );
  assert.equal(first.ok, true);
  assert.deepEqual(calls, ["agent-b:1", "agent-c:2"]);
});

test("hop 4 refused and A→B→A cycle refused", async () => {
  const noop: RunAgentBrief = async () => ({ content: "x" });
  const deepChain: AgentMessageChainContext = {
    threadId: "t",
    hopCount: 3,
    chainSlugs: ["agent-a", "agent-b", "agent-c"],
  };
  const hop4 = await executeMessageAgent(
    { agent: "agent-c", brief: "too deep" },
    { fromAgent: fromA, chain: deepChain },
    noop
  );
  assert.equal(hop4.ok, false);
  if (hop4.ok) throw new Error("expected failure");
  assert.equal(hop4.code, "max_hops");

  const loop = await executeMessageAgent(
    { agent: "agent-a", brief: "ping pong" },
    {
      fromAgent: { name: "B", slug: "agent-b", description: "" },
      chain: {
        threadId: "t2",
        hopCount: 1,
        chainSlugs: ["agent-a", "agent-b"],
      },
    },
    noop
  );
  assert.equal(loop.ok, false);
  if (loop.ok) throw new Error("expected failure");
  assert.equal(loop.code, "cycle");
});

test("dispatch failure sets status failed and agent_reply error", async () => {
  setAgentMessageReceiverRunnerForTests(async () => {
    throw new Error("receiver exploded");
  });
  const thread = await prisma.thread.create({
    data: {
      title: "fail",
      agentId: (await prisma.agent.findUniqueOrThrow({ where: { slug: "agent-a" } })).id,
    },
  });

  const result = await executeMessageAgent(
    { agent: "agent-b", brief: "fail me" },
    { fromAgent: fromA, senderThreadId: thread.id },
    async () => ({ content: "unused" })
  );
  assert.ok(result.ok && "messageId" in result);

  await waitForAgentMessageDispatch(result.messageId);

  const row = await prisma.agentMessage.findUniqueOrThrow({ where: { id: result.messageId } });
  assert.equal(row.status, "failed");
  assert.match(row.error ?? "", /exploded/);

  const replies = await prisma.message.findMany({ where: { threadId: thread.id } });
  assert.ok(replies.some((m) => m.role === "agent_reply" && m.content.includes("failed")));
  setAgentMessageReceiverRunnerForTests(null);
});

test("rate limit triggers", async () => {
  await prisma.agentMessage.deleteMany({ where: { fromAgentSlug: "rate-limiter" } });
  await prisma.agent.create({
    data: {
      slug: "rate-limiter",
      name: "Rate Limiter",
      description: "",
      modelId: "openai/gpt-4o-mini",
      modelName: "Mini",
    },
  });
  const fromRate = { name: "Rate Limiter", slug: "rate-limiter", description: "" };
  const prev = process.env.ATRIUM_AGENT_MESSAGE_RATE_PER_MINUTE;
  process.env.ATRIUM_AGENT_MESSAGE_RATE_PER_MINUTE = "2";
  const noop: RunAgentBrief = async () => ({ content: "ok" });

  const r1 = await executeMessageAgent(
    { agent: "agent-b", brief: "one" },
    { fromAgent: fromRate },
    noop
  );
  const r2 = await executeMessageAgent(
    { agent: "agent-b", brief: "two" },
    { fromAgent: fromRate },
    noop
  );
  const r3 = await executeMessageAgent(
    { agent: "agent-b", brief: "three" },
    { fromAgent: fromRate },
    noop
  );

  process.env.ATRIUM_AGENT_MESSAGE_RATE_PER_MINUTE = prev;

  assert.ok(r1.ok && r2.ok);
  assert.equal(r3.ok, false);
  if (r3.ok) throw new Error("expected rate limit");
  assert.equal(r3.code, "rate_limited");
});
