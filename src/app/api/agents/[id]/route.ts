import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/slug";

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

type Ctx = { params: Promise<{ id: string }> };

async function uniqueSlug(base: string, excludeId: string): Promise<string> {
  let slug = slugify(base);
  let n = 0;
  while (true) {
    const existing = await prisma.agent.findUnique({ where: { slug } });
    if (!existing || existing.id === excludeId) return slug;
    n += 1;
    slug = `${slugify(base)}-${n}`;
  }
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const agent = await prisma.agent.findUnique({
    where: { id },
    select: agentSelect,
  });
  if (!agent) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ agent });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
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

  const existing = await prisma.agent.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const data: {
    name?: string;
    slug?: string;
    description?: string;
    modelId?: string;
    modelName?: string;
    title?: string;
    accent?: string;
  } = {};

  if (typeof body.name === "string" && body.name.trim()) {
    data.name = body.name.trim();
    data.slug = await uniqueSlug(data.name, id);
  }
  if (typeof body.description === "string") {
    data.description = body.description.trim();
  }
  if (typeof body.modelId === "string") {
    data.modelId = body.modelId.trim();
  }
  if (typeof body.modelName === "string") {
    data.modelName = body.modelName.trim();
  }
  if (typeof body.title === "string") {
    data.title = body.title.trim();
  }
  if (typeof body.accent === "string" && body.accent.trim()) {
    data.accent = body.accent.trim();
  }

  const agent = await prisma.agent.update({
    where: { id },
    data,
    select: agentSelect,
  });
  return NextResponse.json({ agent });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    await prisma.agent.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
