import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const threads = await prisma.thread.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      agent: {
        select: { id: true, name: true, title: true, accent: true, slug: true },
      },
      messages: {
        take: 1,
        orderBy: { createdAt: "desc" },
        select: { content: true, role: true },
      },
    },
  });
  return NextResponse.json({ threads });
}

export async function POST(req: NextRequest) {
  let body: { agentId?: string; title?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.agentId) {
    return NextResponse.json({ error: "agentId required" }, { status: 400 });
  }

  const agent = await prisma.agent.findUnique({ where: { id: body.agentId } });
  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const thread = await prisma.thread.create({
    data: {
      agentId: agent.id,
      title: body.title?.trim() || `Chat with ${agent.name}`,
    },
    include: {
      agent: {
        select: { id: true, name: true, title: true, accent: true, slug: true },
      },
    },
  });

  return NextResponse.json({ thread }, { status: 201 });
}
