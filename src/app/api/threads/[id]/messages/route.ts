import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateAssistantReply, type ChatMessage } from "@/lib/llm";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  let body: { content?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const content = body.content?.trim();
  if (!content) {
    return NextResponse.json({ error: "content required" }, { status: 400 });
  }

  const thread = await prisma.thread.findUnique({
    where: { id },
    include: {
      agent: true,
      messages: { orderBy: { createdAt: "asc" }, take: 40 },
    },
  });
  if (!thread) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const userMessage = await prisma.message.create({
    data: {
      threadId: thread.id,
      role: "user",
      content,
    },
  });

  const history: ChatMessage[] = thread.messages.map((m) => ({
    role: m.role as "user" | "assistant" | "system",
    content: m.content,
  }));

  let reply;
  try {
    reply = await generateAssistantReply({
      agent: {
        name: thread.agent.name,
        title: thread.agent.title,
        slug: thread.agent.slug,
        systemPrompt: thread.agent.systemPrompt,
      },
      history,
      userText: content,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "LLM error";
    await prisma.message.create({
      data: {
        threadId: thread.id,
        role: "assistant",
        content: `I hit a provider error: ${message}. Check your LLM env vars or fall back to the offline stub by unsetting OPENAI_API_KEY / OLLAMA_BASE_URL.`,
      },
    });
    const refreshed = await prisma.thread.findUnique({
      where: { id },
      include: {
        agent: true,
        messages: { orderBy: { createdAt: "asc" } },
      },
    });
    return NextResponse.json({ thread: refreshed, error: message }, { status: 502 });
  }

  const assistantMessage = await prisma.message.create({
    data: {
      threadId: thread.id,
      role: "assistant",
      content: reply.content,
      toolHints:
        reply.toolHints.length > 0 ? JSON.stringify(reply.toolHints) : null,
    },
  });

  const titleUpdate =
    thread.messages.length === 0
      ? content.slice(0, 48) + (content.length > 48 ? "…" : "")
      : undefined;

  await prisma.thread.update({
    where: { id: thread.id },
    data: {
      updatedAt: new Date(),
      ...(titleUpdate ? { title: titleUpdate } : {}),
    },
  });

  const refreshed = await prisma.thread.findUnique({
    where: { id },
    include: {
      agent: true,
      messages: { orderBy: { createdAt: "asc" } },
    },
  });

  return NextResponse.json({
    thread: refreshed,
    userMessage,
    assistantMessage,
    provider: reply.provider,
  });
}
