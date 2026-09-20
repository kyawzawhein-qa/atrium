import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { createTestDb } from "./test-db";
import { ensureSeedAgents, resetSeedEnsured, SEED_AGENTS } from "./seed-agents";

const testDb = createTestDb();

after(() => {
  testDb.cleanup();
});

before(async () => {
  resetSeedEnsured();
});

test("ensureSeedAgents upserts personas with message_agent guidance", async () => {
  const { prisma } = await import("./prisma");

  await prisma.agent.create({
    data: {
      slug: "senior-developer",
      name: "Mara Chen",
      title: "Old title",
      description: "Stale persona without inter-agent hints.",
      modelId: "openai/gpt-4o-mini",
      modelName: "Mini",
    },
  });

  await ensureSeedAgents();

  const mara = await prisma.agent.findUniqueOrThrow({
    where: { slug: "senior-developer" },
  });
  assert.match(mara.description, /message_agent/);
  assert.match(mara.description, /Do not say you cannot reach other agents/);

  const count = await prisma.agent.count({
    where: { slug: { in: SEED_AGENTS.map((a) => a.slug) } },
  });
  assert.equal(count, SEED_AGENTS.length);
});
