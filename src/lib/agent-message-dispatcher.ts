/**
 * Picks up queued agent_messages rows and runs the receiver in its own persona/grants.
 */

import { prisma } from "./prisma";
import { generateAssistantReply } from "./llm";
import {
  agentToVoice,
  buildChainSlugsForThread,
  type AgentMessageChainContext,
  type RunAgentBrief,
} from "./message-agent-tool";
import { getAgentMessageDispatchTimeoutMs, getMaxAgentMessageHops } from "./agent-message-config";

export type AgentMessageToolStatus = "queued" | "running" | "done" | "failed";

export type AgentMessageStatusListener = (update: {
  messageId: string;
  status: AgentMessageToolStatus;
  detail?: string;
  error?: string;
}) => void;

const listeners = new Map<string, Set<AgentMessageStatusListener>>();

export function subscribeAgentMessage(
  messageId: string,
  listener: AgentMessageStatusListener
): () => void {
  let set = listeners.get(messageId);
  if (!set) {
    set = new Set();
    listeners.set(messageId, set);
  }
  set.add(listener);
  return () => {
    set?.delete(listener);
    if (set && set.size === 0) listeners.delete(messageId);
  };
}

function emitStatus(
  messageId: string,
  status: AgentMessageToolStatus,
  extra?: { detail?: string; error?: string }
): void {
  const set = listeners.get(messageId);
  if (!set) return;
  for (const fn of set) {
    fn({ messageId, status, ...extra });
  }
}

const inFlight = new Map<string, Promise<void>>();

/** Test-only override for receiver runs (avoids live LLM in unit tests). */
let testReceiverRunner: RunAgentBrief | null = null;

export function setAgentMessageReceiverRunnerForTests(runner: RunAgentBrief | null): void {
  testReceiverRunner = runner;
}

const defaultReceiverRunner: RunAgentBrief = async (voice, brief, chain) => {
  const reply = await generateAssistantReply({
    agent: voice,
    history: [],
    userText: brief,
    streamTokens: false,
    messageAgentEnabled: chain.hopCount < getMaxAgentMessageHops(),
    agentMessageChain: chain,
    inboundAgentMessageId: chain.parentMessageId ?? undefined,
  });
  return { content: reply.content };
};

export function enqueueAgentMessageDispatch(messageId: string): void {
  void waitForAgentMessageDispatch(messageId).catch((err) => {
    console.error("[agent-message-dispatcher]", messageId, err);
  });
}

export async function waitForAgentMessageDispatch(messageId: string): Promise<void> {
  const existing = inFlight.get(messageId);
  if (existing) {
    await existing;
    return;
  }
  const job = dispatchAgentMessage(messageId);
  inFlight.set(messageId, job);
  try {
    await job;
  } finally {
    inFlight.delete(messageId);
  }
}

async function dispatchAgentMessage(messageId: string): Promise<void> {
  try {
    const row = await prisma.agentMessage.findUnique({ where: { id: messageId } });
    if (!row || row.status !== "queued") return;

    await prisma.agentMessage.update({
      where: { id: messageId },
      data: { status: "running" },
    });
    emitStatus(messageId, "running");

    const target = await prisma.agent.findUnique({ where: { slug: row.toAgentSlug } });
    if (!target) {
      await failMessage(messageId, row, `Receiver agent "${row.toAgentSlug}" not found.`);
      return;
    }

    const chainSlugs = await buildChainSlugsForThread(row.threadId);
    const hopCount = row.hopCount;

    const chain: AgentMessageChainContext = {
      threadId: row.threadId,
      hopCount,
      chainSlugs,
      parentMessageId: row.id,
    };

    const voice = agentToVoice(target);
    const timeoutMs = getAgentMessageDispatchTimeoutMs();

    const runner = testReceiverRunner ?? defaultReceiverRunner;
    let replyText: string;
    try {
      replyText = await Promise.race([
        runner(voice, row.body, chain).then((r) => r.content),
        new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error("Agent message timed out")), timeoutMs)
        ),
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Agent run failed";
      await failMessage(messageId, row, message.slice(0, 220));
      return;
    }

    const trimmed = replyText.trim() || "(empty response)";
    await prisma.agentMessage.update({
      where: { id: messageId },
      data: { status: "done", reply: trimmed, error: null },
    });

    if (row.senderThreadId) {
      await prisma.message.create({
        data: {
          threadId: row.senderThreadId,
          role: "agent_reply",
          content: `[Reply from ${target.name} (${target.slug})]\n\n${trimmed}`,
        },
      });
      await prisma.thread.update({
        where: { id: row.senderThreadId },
        data: { updatedAt: new Date() },
      });
    }

    const detail = `→ ${target.name} (${target.slug}): ${preview(trimmed)}`;
    emitStatus(messageId, "done", { detail });
  } catch (err) {
    console.error("[agent-message-dispatcher]", messageId, err);
    throw err;
  }
}

async function failMessage(
  messageId: string,
  row: { senderThreadId: string | null; fromAgentSlug: string; toAgentSlug: string },
  error: string
): Promise<void> {
  await prisma.agentMessage.update({
    where: { id: messageId },
    data: { status: "failed", error },
  });
  if (row.senderThreadId) {
    await prisma.message.create({
      data: {
        threadId: row.senderThreadId,
        role: "agent_reply",
        content: `Agent message to ${row.toAgentSlug} failed: ${error}`,
      },
    });
  }
  emitStatus(messageId, "failed", { error });
}

function preview(text: string): string {
  return text.length > 120 ? text.slice(0, 117) + "…" : text;
}

/** Await queued dispatches started during this assistant generation (for SSE tool updates). */
export async function awaitAgentMessageDispatches(
  messageIds: string[],
  onUpdate?: AgentMessageStatusListener,
  timeoutMs = getAgentMessageDispatchTimeoutMs()
): Promise<void> {
  if (messageIds.length === 0) return;
  const deadline = Date.now() + timeoutMs;
  await Promise.all(
    messageIds.map(
      (id) =>
        new Promise<void>((resolve) => {
          const unsub = subscribeAgentMessage(id, (u) => {
            onUpdate?.(u);
            if (u.status === "done" || u.status === "failed") {
              unsub();
              resolve();
            }
          });
          void waitForAgentMessageDispatch(id);
          const tick = async () => {
            const row = await prisma.agentMessage.findUnique({ where: { id } });
            if (!row || row.status === "done" || row.status === "failed") {
              unsub();
              resolve();
              return;
            }
            if (Date.now() > deadline) {
              unsub();
              resolve();
              return;
            }
            setTimeout(tick, 200);
          };
          void tick();
        })
    )
  );
}
