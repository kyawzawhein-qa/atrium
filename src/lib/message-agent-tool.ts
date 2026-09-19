/**
 * Inter-agent bus: agent A sends a brief to agent B; B runs in its own persona/model
 * and returns a reply to A. Does not merge tool access between agents.
 */

import { prisma } from "./prisma";
import type { AgentVoice } from "./llm";

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
        "Send a short brief to another Atrium agent by slug or name (e.g. senior-developer, Mara, Theo Rios). They answer in their own persona and model; you receive their reply text only.",
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
        },
        required: ["agent", "brief"],
      },
    },
  };
}

export type MessageAgentArgs = {
  agent?: string;
  brief?: string;
};

export type MessageAgentContext = {
  fromAgent: AgentVoice;
};

export type MessageAgentSuccess = {
  ok: true;
  agent: string;
  slug: string;
  reply: string;
};

export type MessageAgentFailure = {
  ok: false;
  code: "invalid" | "unknown_agent" | "self" | "empty_brief" | "agent_error";
  error: string;
};

export type MessageAgentResult = MessageAgentSuccess | MessageAgentFailure;

export type RunAgentBrief = (
  target: AgentVoice,
  brief: string
) => Promise<{ content: string }>;

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

/** Detail shown while a nested agent run is in flight. */
export async function messageAgentPendingDetail(agentKey?: string): Promise<string> {
  const key = agentKey?.trim();
  if (!key) return "→ (agent): consulting…";
  const target = await resolveTargetAgent(key);
  if (target) {
    return `→ ${target.name} (${target.slug}): consulting…`;
  }
  return `→ ${key}: consulting…`;
}

export async function executeMessageAgent(
  args: MessageAgentArgs,
  ctx: MessageAgentContext,
  runBrief: RunAgentBrief
): Promise<MessageAgentResult> {
  const targetKey = args.agent?.trim() || "";
  const brief = args.brief?.trim() || "";

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

  try {
    const voice = agentToVoice(target);
    const { content } = await runBrief(voice, brief);
    return {
      ok: true,
      agent: target.name,
      slug: target.slug,
      reply: content.trim() || "(empty response)",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Agent run failed";
    return { ok: false, code: "agent_error", error: message.slice(0, 220) };
  }
}

export function messageAgentDetail(result: MessageAgentResult): string {
  if (result.ok) {
    const preview =
      result.reply.length > 120 ? result.reply.slice(0, 117) + "…" : result.reply;
    return `→ ${result.agent} (${result.slug}): ${preview}`;
  }
  return result.error.slice(0, 180);
}
