import { prisma } from "./prisma";
import {
  formatAgentReplyFailureBody,
  formatAgentReplyThreadBody,
} from "./agent-reply";

type AgentMessageRow = {
  id: string;
  senderThreadId: string | null;
  toAgentSlug: string;
  senderNotified: boolean;
};

type DeferredPost = { role: string; content: string };

const deferredByThread = new Map<string, DeferredPost[]>();
let deferThreadId: string | null = null;

export function beginDeferringAgentThreadPosts(threadId: string): void {
  deferThreadId = threadId;
  if (!deferredByThread.has(threadId)) {
    deferredByThread.set(threadId, []);
  }
}

export async function flushDeferredAgentThreadPosts(threadId: string): Promise<void> {
  const posts = deferredByThread.get(threadId) ?? [];
  deferredByThread.delete(threadId);
  if (deferThreadId === threadId) deferThreadId = null;
  for (const post of posts) {
    await prisma.message.create({
      data: { threadId, role: post.role, content: post.content },
    });
  }
  if (posts.length > 0) {
    await prisma.thread.update({
      where: { id: threadId },
      data: { updatedAt: new Date() },
    });
  }
}

async function createThreadPost(
  threadId: string,
  role: string,
  content: string
): Promise<void> {
  if (deferThreadId === threadId) {
    deferredByThread.get(threadId)?.push({ role, content });
    return;
  }
  await prisma.message.create({
    data: { threadId, role, content },
  });
  await prisma.thread.update({
    where: { id: threadId },
    data: { updatedAt: new Date() },
  });
}

export async function notifySenderAgentReplySuccess(
  row: AgentMessageRow,
  fromName: string,
  fromSlug: string,
  body: string
): Promise<void> {
  if (!row.senderThreadId || row.senderNotified) return;
  const content = formatAgentReplyThreadBody(fromName, fromSlug, body);
  await createThreadPost(row.senderThreadId, "agent_reply", content);
  await prisma.agentMessage.update({
    where: { id: row.id },
    data: { senderNotified: true },
  });
}

export async function notifySenderAgentReplyFailure(
  row: AgentMessageRow,
  error: string
): Promise<void> {
  if (!row.senderThreadId || row.senderNotified) return;
  await createThreadPost(
    row.senderThreadId,
    "agent_reply",
    formatAgentReplyFailureBody(row.toAgentSlug, error)
  );
  await prisma.agentMessage.update({
    where: { id: row.id },
    data: { senderNotified: true },
  });
}

export async function markAgentMessageFailed(
  messageId: string,
  error: string
): Promise<void> {
  const row = await prisma.agentMessage.findUnique({ where: { id: messageId } });
  if (!row) return;
  if (row.status !== "failed") {
    await prisma.agentMessage.update({
      where: { id: messageId },
      data: { status: "failed", error },
    });
  } else if (row.error !== error) {
    await prisma.agentMessage.update({
      where: { id: messageId },
      data: { error },
    });
  }
  const fresh = await prisma.agentMessage.findUniqueOrThrow({ where: { id: messageId } });
  await notifySenderAgentReplyFailure(fresh, error);
}
