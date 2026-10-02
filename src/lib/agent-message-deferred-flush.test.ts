import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { createTestDb } from "./test-db";
import { prisma } from "./prisma";
import {
  beginDeferringAgentThreadPosts,
  flushDeferredAgentThreadPosts,
  notifySenderAgentReplySuccess,
} from "./agent-message-notify";

const testDb = createTestDb();

after(async () => {
  await testDb.cleanup();
});

before(async () => {
  await prisma.agent.create({
    data: {
      slug: "flush-agent",
      name: "Flush Agent",
      description: "",
      modelId: "openai/gpt-4o-mini",
      modelName: "Mini",
    },
  });
});

test("JSON error path flushes deferred agent_reply before returning thread", async () => {
  const agent = await prisma.agent.findUniqueOrThrow({ where: { slug: "flush-agent" } });
  const thread = await prisma.thread.create({
    data: { title: "flush", agentId: agent.id },
  });
  const inbox = await prisma.agentMessage.create({
    data: {
      threadId: thread.id,
      fromAgentSlug: "flush-agent",
      toAgentSlug: "flush-agent",
      body: "x",
      status: "done",
      senderThreadId: thread.id,
      senderNotified: false,
    },
  });

  beginDeferringAgentThreadPosts(thread.id);
  await notifySenderAgentReplySuccess(inbox, "Flush Agent", "flush-agent", "deferred body");

  const beforeFlush = await prisma.message.count({
    where: { threadId: thread.id, role: "agent_reply" },
  });
  assert.equal(beforeFlush, 0);

  await flushDeferredAgentThreadPosts(thread.id);

  const afterFlush = await prisma.message.count({
    where: { threadId: thread.id, role: "agent_reply" },
  });
  assert.equal(afterFlush, 1);
});
