/**
 * POST /api/threads/[id]/messages
 * SSE when Accept: text/event-stream or ?stream=1; otherwise JSON fallback.
 * Events: token | tool | done | error
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  generateAssistantReply,
  type ChatMessage,
  type StreamEvent,
  type ToolLogEntry,
} from "@/lib/llm";

type Ctx = { params: Promise<{ id: string }> };

function wantsStream(req: NextRequest): boolean {
  const accept = req.headers.get("accept") || "";
  if (accept.includes("text/event-stream")) return true;
  return req.nextUrl.searchParams.get("stream") === "1";
}

function sseEncode(event: StreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

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

  const agentVoice = {
    name: thread.agent.name,
    description: thread.agent.description,
    slug: thread.agent.slug,
    modelId: thread.agent.modelId,
    modelName: thread.agent.modelName,
  };

  const titleUpdate =
    thread.messages.length === 0
      ? content.slice(0, 48) + (content.length > 48 ? "…" : "")
      : undefined;

  if (wantsStream(req)) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: StreamEvent) => {
          controller.enqueue(encoder.encode(sseEncode(event)));
        };

        try {
          const reply = await generateAssistantReply({
            agent: agentVoice,
            history,
            userText: content,
            streamTokens: true,
            onEvent: send,
          });

          const toolHints =
            reply.toolLog.length > 0
              ? JSON.stringify(reply.toolLog)
              : reply.toolHints.length > 0
                ? JSON.stringify(
                    reply.toolHints.map(
                      (name): ToolLogEntry => ({
                        id: name,
                        name,
                        status: "ran",
                        detail: "",
                      })
                    )
                  )
                : null;

          const assistantMessage = await prisma.message.create({
            data: {
              threadId: thread.id,
              role: "assistant",
              content: reply.content,
              toolHints,
            },
          });

          await prisma.thread.update({
            where: { id: thread.id },
            data: {
              updatedAt: new Date(),
              ...(titleUpdate ? { title: titleUpdate } : {}),
            },
          });

          send({
            type: "done",
            messageId: assistantMessage.id,
            toolLog: reply.toolLog,
            content: reply.content,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "LLM error";
          const assistantMessage = await prisma.message.create({
            data: {
              threadId: thread.id,
              role: "assistant",
              content: `I hit a provider error: ${message}. Check Settings → OpenRouter key and this agent's model.`,
            },
          });
          send({ type: "error", message });
          send({
            type: "done",
            messageId: assistantMessage.id,
            toolLog: [],
            content: `I hit a provider error: ${message}. Check Settings → OpenRouter key and this agent's model.`,
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }

  // JSON fallback (non-streaming clients)
  let reply;
  try {
    reply = await generateAssistantReply({
      agent: agentVoice,
      history,
      userText: content,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "LLM error";
    await prisma.message.create({
      data: {
        threadId: thread.id,
        role: "assistant",
        content: `I hit a provider error: ${message}. Check Settings → OpenRouter key and this agent's model.`,
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
        reply.toolLog.length > 0
          ? JSON.stringify(reply.toolLog)
          : reply.toolHints.length > 0
            ? JSON.stringify(reply.toolHints)
            : null,
    },
  });

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
