import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

const agentSelect = {
  id: true,
  name: true,
  title: true,
  accent: true,
  slug: true,
  description: true,
  modelId: true,
  modelName: true,
} as const;

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const thread = await prisma.thread.findUnique({
    where: { id },
    include: {
      agent: { select: agentSelect },
      messages: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!thread) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ thread });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  let body: { title?: string; agentId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const data: { title?: string; agentId?: string } = {};
  if (typeof body.title === "string" && body.title.trim()) {
    data.title = body.title.trim();
  }
  if (typeof body.agentId === "string") {
    const agent = await prisma.agent.findUnique({ where: { id: body.agentId } });
    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }
    data.agentId = body.agentId;
  }

  try {
    const thread = await prisma.thread.update({
      where: { id },
      data,
      include: {
        agent: { select: agentSelect },
      },
    });
    return NextResponse.json({ thread });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    await prisma.thread.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
