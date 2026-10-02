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

export async function notifySenderAgentReplySuccess(
  row: AgentMessageRow,
  fromName: string,
  fromSlug: string,
  body: string
): Promise<void> {
  if (!row.senderThreadId || row.senderNotified) return;
  const content = formatAgentReplyThreadBody(fromName, fromSlug, body);
  await prisma.message.create({
    data: {
      threadId: row.senderThreadId,
      role: "agent_reply",
      content,
    },
  });
  await prisma.thread.update({
    where: { id: row.senderThreadId },
    data: { updatedAt: new Date() },
  });
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
  await prisma.message.create({
    data: {
      threadId: row.senderThreadId,
      role: "agent_reply",
      content: formatAgentReplyFailureBody(row.toAgentSlug, error),
    },
  });
  await prisma.thread.update({
    where: { id: row.senderThreadId },
    data: { updatedAt: new Date() },
  });
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
