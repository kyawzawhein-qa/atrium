/**
 * Inter-agent bus: agent A sends a brief to agent B; B runs in its own persona/model
 * and returns a reply to A. Does not merge tool access between agents.
 */

import { randomUUID } from "node:crypto";
import { prisma } from "./prisma";
import type { AgentVoice, ToolLogEntry } from "./llm";
import { getAgentMessageRateLimitPerMinute, getMaxAgentMessageHops } from "./agent-message-config";
import { enqueueAgentMessageDispatch } from "./agent-message-dispatcher";
import { markAgentMessageFailed } from "./agent-message-notify";

export const MESSAGE_AGENT_TOOL_ID = "message_agent";

/** Well-known aliases for seeded specialists (slug → lookup keys). */
export const AGENT_SLUG_ALIASES: Record<string, string[]> = {
  "senior-developer": [
    "mara",
    "mara chen",
    "senior developer",
    "senior-developer",
    "senior_developer",
  ],
  "graphic-designer": [
    "theo",
    "theo rios",
    "graphic designer",
    "graphic-designer",
    "graphic_designer",
  ],
  "qa-automation": [
    "imani",
    "imani brooks",
    "qa automation",
    "qa-automation",
    "qa_automation",
  ],
};

export function messageAgentToolDefinition() {
  return {
    type: "function" as const,
    function: {
      name: MESSAGE_AGENT_TOOL_ID,
      description:
        "Send a short brief to another Atrium agent by slug or name (e.g. senior-developer, Mara, Theo Rios). They answer in their own persona and model; you receive their reply text (async by default, or set wait:true to block until they answer).",
      parameters: {
        type: "object",
        properties: {
          agent: {
            type: "string",
            description:
              "Target agent slug, first name, or display name (e.g. Mara, graphic-designer, Theo Rios)",
          },
          brief: {
            type: "string",
            description: "Task or question for that agent (keep it concise)",
          },
          wait: {
            type: "boolean",
            description:
              "When true, block until the other agent replies (legacy synchronous behaviour). Default false queues the message.",
          },
        },
        required: ["agent", "brief"],
      },
    },
  };
}

export type MessageAgentArgs = {
  agent?: string;
  brief?: string;
  wait?: boolean;
};

export type AgentMessageChainContext = {
  threadId: string;
  hopCount: number;
  chainSlugs: string[];
  parentMessageId?: string | null;
};

export type MessageAgentContext = {
  fromAgent: AgentVoice;
  senderThreadId?: string;
  senderToolLogId?: string;
  chain?: AgentMessageChainContext;
  /** When executing inside a dispatcher run, the queued row id delivered to this agent. */
  inboundAgentMessageId?: string;
};

export type MessageAgentSuccess = {
  ok: true;
  agent: string;
  slug: string;
  reply: string;
};

export type MessageAgentQueuedSuccess = {
  ok: true;
  queued: true;
  messageId: string;
};

export type MessageAgentFailure = {
  ok: false;
  code:
    | "invalid"
    | "unknown_agent"
    | "self"
    | "empty_brief"
    | "agent_error"
    | "rate_limited"
    | "max_hops"
    | "cycle";
  error: string;
};

export type MessageAgentResult =
  | MessageAgentSuccess
  | MessageAgentQueuedSuccess
  | MessageAgentFailure;

export type RunAgentBriefResult = { content: string; toolLog?: ToolLogEntry[] };

export type RunAgentBrief = (
  target: AgentVoice,
  brief: string,
  chain: AgentMessageChainContext,
  signal?: AbortSignal
) => Promise<RunAgentBriefResult>;

function normalizeLookupKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_]+/g, " ");
}

function slugifyKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_]+/g, "-");
}

function uniqueMatch<T>(items: T[]): T | null {
  return items.length === 1 ? items[0] : null;
}

export async function resolveTargetAgent(identifier: string) {
  const key = identifier.trim();
  if (!key) return null;

  const bySlug = await prisma.agent.findUnique({ where: { slug: key } });
  if (bySlug) return bySlug;

  const slugKey = slugifyKey(key);
  const bySlugNormalized = await prisma.agent.findUnique({ where: { slug: slugKey } });
  if (bySlugNormalized) return bySlugNormalized;

  const byId = await prisma.agent.findUnique({ where: { id: key } });
  if (byId) return byId;

  const agents = await prisma.agent.findMany();
  const lower = normalizeLookupKey(key);

  const byFullName = agents.find((a) => normalizeLookupKey(a.name) === lower);
  if (byFullName) return byFullName;

  const byTitle = uniqueMatch(
    agents.filter((a) => a.title && normalizeLookupKey(a.title) === lower)
  );
  if (byTitle) return byTitle;

  const byFirstName = uniqueMatch(
    agents.filter((a) => normalizeLookupKey(a.name).split(" ")[0] === lower)
  );
  if (byFirstName) return byFirstName;

  for (const agent of agents) {
    const aliases = AGENT_SLUG_ALIASES[agent.slug] ?? [];
    if (aliases.some((alias) => normalizeLookupKey(alias) === lower)) {
      return agent;
    }
  }

  const byNamePrefix = uniqueMatch(
    agents.filter((a) => normalizeLookupKey(a.name).startsWith(`${lower} `))
  );
  if (byNamePrefix) return byNamePrefix;

  return null;
}

export function agentToVoice(agent: {
  name: string;
  description: string;
  slug: string;
  modelId: string;
  modelName: string;
}): AgentVoice {
  return {
    name: agent.name,
    description: agent.description,
    slug: agent.slug,
    modelId: agent.modelId,
    modelName: agent.modelName,
  };
}

export async function walkParentChainSlugs(
  parentMessageId: string | null,
  fromAgentSlug: string
): Promise<string[]> {
  if (!parentMessageId) return [fromAgentSlug];
  const parent = await prisma.agentMessage.findUnique({ where: { id: parentMessageId } });
  if (!parent) return [fromAgentSlug];
  const ancestors = await walkParentChainSlugs(parent.parentMessageId, parent.fromAgentSlug);
  if (!ancestors.includes(parent.toAgentSlug)) ancestors.push(parent.toAgentSlug);
  if (!ancestors.includes(fromAgentSlug)) ancestors.push(fromAgentSlug);
  return ancestors;
}

export async function buildChainSlugsForMessageRow(row: {
  chainSlugsJson: string;
  fromAgentSlug: string;
  parentMessageId: string | null;
}): Promise<string[]> {
  try {
    const parsed = JSON.parse(row.chainSlugsJson) as unknown;
    if (Array.isArray(parsed) && parsed.every((s) => typeof s === "string") && parsed.length > 0) {
      return parsed as string[];
    }
  } catch {
    /* use parent walk */
  }
  return walkParentChainSlugs(row.parentMessageId, row.fromAgentSlug);
}

/** @deprecated use buildChainSlugsForMessageRow */
export async function buildChainSlugsForThread(threadId: string): Promise<string[]> {
  const latest = await prisma.agentMessage.findFirst({
    where: { threadId },
    orderBy: { createdAt: "desc" },
  });
  if (!latest) return [];
  return buildChainSlugsForMessageRow(latest);
}

function nextHopCount(ctx: MessageAgentContext): number {
  return (ctx.chain?.hopCount ?? 0) + 1;
}

function chainSlugsForSend(ctx: MessageAgentContext, toSlug: string): string[] {
  const base = ctx.chain?.chainSlugs ?? [ctx.fromAgent.slug];
  const slugs = [...base];
  if (!slugs.includes(ctx.fromAgent.slug)) slugs.push(ctx.fromAgent.slug);
  if (!slugs.includes(toSlug)) slugs.push(toSlug);
  return slugs;
}

type CreateAgentMessageData = {
  fromAgentSlug: string;
  toAgentSlug: string;
  threadId: string;
  parentMessageId: string | null;
  hopCount: number;
  chainSlugsJson: string;
  body: string;
  status: string;
  senderThreadId: string | null;
  senderToolLogId: string | null;
};

async function createAgentMessageWithRateLimit(
  data: CreateAgentMessageData
): Promise<{ id: string } | null> {
  const limit = getAgentMessageRateLimitPerMinute();
  const since = new Date(Date.now() - 60_000);
  return prisma.$transaction(async (tx) => {
    const count = await tx.agentMessage.count({
      where: { fromAgentSlug: data.fromAgentSlug, createdAt: { gte: since } },
    });
    if (count >= limit) return null;
    return tx.agentMessage.create({ data });
  });
}

/** Detail shown while a nested agent run is in flight. */
export async function messageAgentPendingDetail(
  agentKey?: string,
  phase: "consulting" | "queued" = "consulting"
): Promise<string> {
  const suffix = phase === "queued" ? "queued…" : "consulting…";
  const key = agentKey?.trim();
  if (!key) return `→ (agent): ${suffix}`;
  const target = await resolveTargetAgent(key);
  if (target) {
    return `→ ${target.name} (${target.slug}): ${suffix}`;
  }
  return `→ ${key}: ${suffix}`;
}

export async function executeMessageAgent(
  args: MessageAgentArgs,
  ctx: MessageAgentContext,
  runBrief: RunAgentBrief
): Promise<MessageAgentResult> {
  const targetKey = args.agent?.trim() || "";
  const brief = args.brief?.trim() || "";
  const wait = args.wait === true;
  const insideReceiver = Boolean(ctx.inboundAgentMessageId);
  /** Nested hops inside a receiver run must block until the callee answers (phase 1). */
  const effectiveWait = wait || insideReceiver;

  if (!targetKey) {
    return { ok: false, code: "invalid", error: "agent is required" };
  }
  if (!brief) {
    return { ok: false, code: "empty_brief", error: "brief is required" };
  }

  const target = await resolveTargetAgent(targetKey);
  if (!target) {
    return {
      ok: false,
      code: "unknown_agent",
      error: `No agent matches "${targetKey}". Use a slug or name from Agents.`,
    };
  }

  if (target.slug === ctx.fromAgent.slug) {
    return {
      ok: false,
      code: "self",
      error: "Cannot message yourself. Pick another agent.",
    };
  }

  const hopCount = nextHopCount(ctx);
  const maxHops = getMaxAgentMessageHops();
  if (hopCount > maxHops) {
    return {
      ok: false,
      code: "max_hops",
      error: `Message chain exceeded max hops (${maxHops}).`,
    };
  }

  const priorSlugs = ctx.chain?.chainSlugs ?? [ctx.fromAgent.slug];
  if (priorSlugs.includes(target.slug)) {
    return {
      ok: false,
      code: "cycle",
      error: `Refusing ping-pong: ${target.slug} is already in this message chain.`,
    };
  }

  const threadId = ctx.chain?.threadId ?? randomUUID();
  const chainSlugs = chainSlugsForSend(ctx, target.slug);
  const chain: AgentMessageChainContext = {
    threadId,
    hopCount,
    chainSlugs,
    parentMessageId: ctx.inboundAgentMessageId ?? ctx.chain?.parentMessageId ?? null,
  };

  const row = await createAgentMessageWithRateLimit({
    fromAgentSlug: ctx.fromAgent.slug,
    toAgentSlug: target.slug,
    threadId,
    parentMessageId: ctx.inboundAgentMessageId ?? ctx.chain?.parentMessageId ?? null,
    hopCount,
    chainSlugsJson: JSON.stringify(chainSlugs),
    body: brief,
    status: effectiveWait ? "running" : "queued",
    senderThreadId: ctx.senderThreadId ?? null,
    senderToolLogId: ctx.senderToolLogId ?? null,
  });

  if (!row) {
    return {
      ok: false,
      code: "rate_limited",
      error: "Outbound agent message rate limit exceeded. Try again in a minute.",
    };
  }

  if (!effectiveWait) {
    enqueueAgentMessageDispatch(row.id);
    return { ok: true, queued: true, messageId: row.id };
  }

  try {
    const voice = agentToVoice(target);
    const { content, toolLog } = await runBrief(voice, brief, chain);
    const trimmed = content.trim() || "(empty response)";
    await prisma.agentMessage.update({
      where: { id: row.id },
      data: {
        status: "done",
        reply: trimmed,
        error: null,
        receiverToolLog: toolLog && toolLog.length > 0 ? JSON.stringify(toolLog) : null,
      },
    });
    return {
      ok: true,
      agent: target.name,
      slug: target.slug,
      reply: trimmed,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Agent run failed";
    const errText = message.slice(0, 220);
    await markAgentMessageFailed(row.id, errText);
    return { ok: false, code: "agent_error", error: errText };
  }
}

export function messageAgentDetail(result: MessageAgentResult): string {
  if (result.ok && "queued" in result && result.queued) {
    return `→ queued (message ${result.messageId.slice(0, 8)}…)`;
  }
  if (result.ok && "reply" in result) {
    const preview =
      result.reply.length > 120 ? result.reply.slice(0, 117) + "…" : result.reply;
    return `→ ${result.agent} (${result.slug}): ${preview}`;
  }
  if (!result.ok) {
    return result.error.slice(0, 180);
  }
  return "";
}

export function toolStatusForMessageAgentResult(
  result: MessageAgentResult
): "queued" | "ran" | "error" {
  if (!result.ok) return "error";
  if ("queued" in result && result.queued) return "queued";
  return "ran";
}
