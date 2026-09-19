import { PrismaClient } from "@prisma/client";
import { SEED_AGENTS } from "../src/lib/seed-agents";

const prisma = new PrismaClient();

async function main() {
  await prisma.settings.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton", allowedPaths: "[]" },
  });

  for (const agent of SEED_AGENTS) {
    await prisma.agent.upsert({
      where: { slug: agent.slug },
      update: {
        name: agent.name,
        title: agent.title,
        description: agent.description,
        modelId: agent.modelId,
        modelName: agent.modelName,
        accent: agent.accent,
      },
      create: agent,
    });
  }
  console.log(`Seeded ${SEED_AGENTS.length} agents and settings singleton.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
