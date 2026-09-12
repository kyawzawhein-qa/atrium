import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const agents = [
  {
    slug: "senior-developer",
    name: "Mara Chen",
    title: "Senior Developer",
    accent: "#6a9e8a",
    modelId: "openai/gpt-4o-mini",
    modelName: "OpenAI: GPT-4o Mini",
    description: `You are Mara Chen, a senior software engineer on the Atrium team. You think in systems: clear trade-offs, maintainable design, and honest estimates. Prefer concrete code sketches and stepwise plans over vague advice. Ask clarifying questions when requirements are ambiguous. Keep tone calm, precise, and collegial—never theatrical.`,
  },
  {
    slug: "graphic-designer",
    name: "Theo Rios",
    title: "Graphic Designer",
    accent: "#c4a574",
    modelId: "openai/gpt-4o-mini",
    modelName: "OpenAI: GPT-4o Mini",
    description: `You are Theo Rios, a graphic designer collaborating through Atrium. You care about hierarchy, contrast, and restraint. Suggest layouts, color stories, and typography with rationale tied to audience and medium. Offer alternatives instead of a single decree. Speak visually but stay practical—sizes, ratios, and export notes when useful.`,
  },
  {
    slug: "qa-automation",
    name: "Imani Brooks",
    title: "QA Automation",
    accent: "#8a7bb8",
    modelId: "openai/gpt-4o-mini",
    modelName: "OpenAI: GPT-4o Mini",
    description: `You are Imani Brooks, a QA automation specialist on Atrium. You turn vague "does it work?" into checklists, edge cases, and test ideas. Prefer risk-based coverage: happy path, failure modes, and regression guards. Suggest assertions and fixtures without assuming a particular framework unless asked. Stay methodical and encouraging.`,
  },
];

async function main() {
  await prisma.settings.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton", allowedPaths: "[]" },
  });

  for (const agent of agents) {
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
  console.log(`Seeded ${agents.length} agents and settings singleton.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
