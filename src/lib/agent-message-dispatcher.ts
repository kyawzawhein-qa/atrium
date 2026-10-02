/**
 * Picks up queued agent_messages rows and runs the receiver in its own persona/grants.
 */

import { prisma } from "./prisma";
import { generateAssistantReply, type ToolLogEntry } from "./llm";
import {
  agentToVoice,
  buildChainSlugsForMessageRow,
  type AgentMessageChainContext,
  type RunAgentBrief,
} from "./message-agent-tool";
import {
  getAgentMessageDispatchTimeoutMs,
  getAgentMessageMaxConcurrent,
  getMaxAgentMessageHops,
} from "./agent-message-config";
import {
  markAgentMessageFailed,
  notifySenderAgentReplyFailure,
  notifySenderAgentReplySuccess,
} from "./agent-message-notify";
import { appendReceiverToolSummary, summarizeReceiverToolLog } from "./receiver-tool-summary";

export type AgentMessageToolStatus = "queued" | "running" | "done" | "failed";

export type AgentMessageStatusListener = (update: {
  messageId: string;
  status: AgentMessageToolStatus;
  detail?: string;
  error?: string;
}) => void;

const listeners = new Map<string, Set<AgentMessageStatusListener>>();

let bootPromise: Promise<void> | null = null;
let bootDisabledForTests = false;
let autoDispatchEnabled = true;

let activeDispatches = 0;
const dispatchWaiters: Array<() => void> = [];
const activeTimers = new Set<ReturnType<typeof setTimeout>>();

export function disableAgentMessageDispatcherBootForTests(): void {
  bootDisabledForTests = true;
}

export function setAgentMessageAutoDispatchForTests(enabled: boolean): void {
  autoDispatchEnabled = enabled;
}

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

const defaultReceiverRunner: RunAgentBrief = async (voice, brief, chain, signal) => {
  const reply = await generateAssistantReply({
    agent: voice,
    history: [],
    userText: brief,
    streamTokens: false,
    messageAgentEnabled: chain.hopCount < getMaxAgentMessageHops(),
    agentMessageChain: chain,
    inboundAgentMessageId: chain.parentMessageId ?? undefined,
    abortSignal: signal,
  });
  return { content: reply.content, toolLog: reply.toolLog };
};

async function acquireDispatchSlot(): Promise<void> {
  const max = getAgentMessageMaxConcurrent();
  if (activeDispatches < max) {
    activeDispatches++;
    return;
  }
  await new Promise<void>((resolve) => {
    dispatchWaiters.push(resolve);
  });
  activeDispatches++;
}

function releaseDispatchSlot(): void {
  activeDispatches--;
  const next = dispatchWaiters.shift();
  if (next) next();
}

function trackTimeout(timer: ReturnType<typeof setTimeout>): ReturnType<typeof setTimeout> {
  activeTimers.add(timer);
  return timer;
}

function clearTrackedTimeout(timer: ReturnType<typeof setTimeout>): void {
  clearTimeout(timer);
  activeTimers.delete(timer);
}

export async function bootAgentMessageDispatcher(): Promise<void> {
  if (bootDisabledForTests) return;
  if (bootPromise) return bootPromise;
  bootPromise = runStartupSweep();
  return bootPromise;
}

export async function runAgentMessageRecoverySweepForTests(): Promise<void> {
  const prev = autoDispatchEnabled;
  autoDispatchEnabled = false;
  try {
    await runStartupSweep();
  } finally {
    autoDispatchEnabled = prev;
  }
}

async function runStartupSweep(): Promise<void> {
  const timeoutMs = getAgentMessageDispatchTimeoutMs();
  const staleBefore = new Date(Date.now() - timeoutMs);

  const rows = await prisma.agentMessage.findMany({
    where: {
      status: { in: ["queued", "running", "failed"] },
    },
    orderBy: { createdAt: "asc" },
  });

  const toDispatch: string[] = [];

  for (const row of rows) {
    const stale = row.createdAt < staleBefore;
    if (row.status === "failed") {
      if (!row.senderNotified) {
        await notifySenderAgentReplyFailure(row, row.error ?? "Agent message failed.");
      }
      continue;
    }

    if (stale) {
      const err = "Agent message exceeded timeout during server recovery.";
      await prisma.agentMessage.update({
        where: { id: row.id },
        data: { status: "failed", error: err },
      });
      const updated = await prisma.agentMessage.findUniqueOrThrow({ where: { id: row.id } });
      await notifySenderAgentReplyFailure(updated, err);
      emitStatus(row.id, "failed", { error: err });
      continue;
    }

    if (row.status === "running") {
      await prisma.agentMessage.update({
        where: { id: row.id },
        data: { status: "queued" },
      });
      toDispatch.push(row.id);
      continue;
    }

    if (row.status === "queued") {
      toDispatch.push(row.id);
    }
  }

  for (const id of toDispatch) {
    if (autoDispatchEnabled) {
      enqueueAgentMessageDispatch(id);
    }
  }
}

export function enqueueAgentMessageDispatch(messageId: string): void {
  if (!autoDispatchEnabled) return;
  void bootAgentMessageDispatcher()
    .then(() => waitForAgentMessageDispatch(messageId))
    .catch((err) => {
      console.error("[agent-message-dispatcher]", messageId, err);
    });
}

export async function waitForAgentMessageDispatch(messageId: string): Promise<void> {
  await bootAgentMessageDispatcher();
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

export async function drainAgentMessageDispatcherForTests(): Promise<void> {
  await bootAgentMessageDispatcher();
  while (inFlight.size > 0 || activeDispatches > 0) {
    await Promise.all([...inFlight.values()]);
    if (inFlight.size === 0 && activeDispatches > 0 && dispatchWaiters.length === 0) {
      break;
    }
  }
}

export async function resetAgentMessageDispatcherForTests(): Promise<void> {
  await drainAgentMessageDispatcherForTests();
  for (const timer of activeTimers) {
    clearTimeout(timer);
  }
  activeTimers.clear();
  inFlight.clear();
  listeners.clear();
  testReceiverRunner = null;
  bootPromise = null;
  bootDisabledForTests = true;
  autoDispatchEnabled = true;
  activeDispatches = 0;
  dispatchWaiters.length = 0;
}

async function dispatchAgentMessage(messageId: string): Promise<void> {
  await acquireDispatchSlot();
  try {
    const claimed = await prisma.agentMessage.updateMany({
      where: { id: messageId, status: "queued" },
      data: { status: "running" },
    });
    if (claimed.count !== 1) return;

    emitStatus(messageId, "running");

    const row = await prisma.agentMessage.findUniqueOrThrow({ where: { id: messageId } });
    const target = await prisma.agent.findUnique({ where: { slug: row.toAgentSlug } });
    if (!target) {
      await markAgentMessageFailed(messageId, `Receiver agent "${row.toAgentSlug}" not found.`);
      emitStatus(messageId, "failed", {
        error: `Receiver agent "${row.toAgentSlug}" not found.`,
      });
      return;
    }

    const chainSlugs = await buildChainSlugsForMessageRow(row);
    const chain: AgentMessageChainContext = {
      threadId: row.threadId,
      hopCount: row.hopCount,
      chainSlugs,
      parentMessageId: row.id,
    };

    const voice = agentToVoice(target);
    const timeoutMs = getAgentMessageDispatchTimeoutMs();
    const runner = testReceiverRunner ?? defaultReceiverRunner;

    const ac = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    let replyText: string;
    let receiverToolLog: ToolLogEntry[] = [];
    try {
      const runResult = await Promise.race([
        runner(voice, row.body, chain, ac.signal),
        new Promise<never>((_, reject) => {
          timer = trackTimeout(
            setTimeout(() => {
              ac.abort(new Error("Agent message timed out"));
              reject(new Error("Agent message timed out"));
            }, timeoutMs)
          );
        }),
      ]);
      replyText = runResult.content;
      receiverToolLog = runResult.toolLog ?? [];
    } catch (err) {
      const message = err instanceof Error ? err.message : "Agent run failed";
      await markAgentMessageFailed(messageId, message.slice(0, 220));
      emitStatus(messageId, "failed", { error: message.slice(0, 220) });
      return;
    } finally {
      if (timer !== undefined) clearTrackedTimeout(timer);
    }

    const trimmed = appendReceiverToolSummary(
      replyText.trim() || "(empty response)",
      receiverToolLog
    );
    await prisma.agentMessage.update({
      where: { id: messageId },
      data: {
        status: "done",
        reply: trimmed,
        error: null,
        receiverToolLog:
          receiverToolLog.length > 0 ? JSON.stringify(receiverToolLog) : null,
      },
    });

    const fresh = await prisma.agentMessage.findUniqueOrThrow({ where: { id: messageId } });
    await notifySenderAgentReplySuccess(fresh, target.name, target.slug, trimmed);

    const toolNote = summarizeReceiverToolLog(receiverToolLog);
    const detail = toolNote
      ? `→ ${target.name} (${target.slug}): ${preview(trimmed)} · ${toolNote}`
      : `→ ${target.name} (${target.slug}): ${preview(trimmed)}`;
    emitStatus(messageId, "done", { detail });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Dispatch failed";
    console.error("[agent-message-dispatcher]", messageId, err);
    await markAgentMessageFailed(messageId, message.slice(0, 220));
    emitStatus(messageId, "failed", { error: message.slice(0, 220) });
  } finally {
    releaseDispatchSlot();
  }
}

function preview(text: string): string {
  return text.length > 120 ? text.slice(0, 117) + "…" : text;
}

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
          void waitForAgentMessageDispatch(id).catch((err) => {
            console.error("[agent-message-dispatcher] await dispatch", id, err);
            unsub();
            resolve();
          });
          const tick = (): void => {
            void (async () => {
              try {
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
              } catch (err) {
                console.error("[agent-message-dispatcher] await tick", id, err);
                unsub();
                resolve();
              }
            })();
          };
          tick();
        })
    )
  );
}
