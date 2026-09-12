import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { pickAccent, slugify } from "@/lib/slug";

const agentSelect = {
  id: true,
  slug: true,
  name: true,
  title: true,
  description: true,
  modelId: true,
  modelName: true,
  accent: true,
  createdAt: true,
} as const;

async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  let slug = slugify(base);
  let n = 0;
  while (true) {
    const existing = await prisma.agent.findUnique({ where: { slug } });
    if (!existing || existing.id === excludeId) return slug;
    n += 1;
    slug = `${slugify(base)}-${n}`;
  }
}

export async function GET() {
  const agents = await prisma.agent.findMany({
    orderBy: { createdAt: "asc" },
    select: agentSelect,
  });
  return NextResponse.json({ agents });
}

export async function POST(req: NextRequest) {
  let body: {
    name?: string;
    description?: string;
    modelId?: string;
    modelName?: string;
    title?: string;
    accent?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  const description = body.description?.trim() ?? "";
  const modelId = body.modelId?.trim() ?? "";
  const modelName = body.modelName?.trim() ?? "";
  const title = body.title?.trim() ?? "";

  const count = await prisma.agent.count();
  const slug = await uniqueSlug(name);

  const agent = await prisma.agent.create({
    data: {
      slug,
      name,
      title,
      description,
      modelId,
      modelName,
      accent: body.accent?.trim() || pickAccent(count),
    },
    select: agentSelect,
  });

  return NextResponse.json({ agent }, { status: 201 });
}
