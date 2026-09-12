import { extractToolMentions } from "./tools";
import { executeFsTool } from "./fs-tools";
import { getStudioSettings } from "./settings";
import {
  OPENROUTER_BASE,
  openRouterHeaders,
} from "./openrouter";

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  name?: string;
};

export type LlmResult = {
  content: string;
  toolHints: string[];
  provider: "openrouter" | "offline";
};

export type AgentVoice = {
  name: string;
  description: string;
  slug: string;
  modelId?: string | null;
  modelName?: string | null;
};

const FS_TOOLS = [
  {
    type: "function",
    function: {
      name: "list_dir",
      description:
        "List files and folders in an absolute directory path. Only works for paths the operator granted in Atrium Settings. Runs on the machine hosting this Atrium server.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Absolute directory path on the server machine",
          },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description:
        "Read a text file at an absolute path. Only works for paths the operator granted in Atrium Settings. Max 64KB. Runs on the machine hosting this Atrium server.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Absolute file path on the server machine",
          },
        },
        required: ["path"],
      },
    },
  },
];

function buildSystemPrompt(agent: AgentVoice, toolsGranted: boolean): string {
  const persona = agent.description.trim() || `You are ${agent.name}, an Atrium specialist.`;
  const tools = toolsGranted
    ? "The operator has granted filesystem tools (list_dir, read_file) for specific absolute paths. Use them when the user asks about files in those locations. If a path is outside the allowlist, say so and do not invent contents."
    : "Filesystem tools are not granted. The operator has not added any allowed computer paths. Do not claim you can read or list files.";
  return [
    persona,
    "",
    `Your name is ${agent.name}. Stay in this persona. Do not impersonate other agents.`,
    tools,
  ].join("\n");
}

function buildOfflineReply(agent: AgentVoice, userText: string): string {
  const lastUser = userText.trim().slice(0, 280);
  const hint = agent.description.trim().slice(0, 160);
  return [
    `*(offline — OpenRouter API key missing. Add one in Settings to chat for real.)*`,
    ``,
    `${agent.name} received: “${lastUser}”.`,
    hint
      ? `I would answer in this persona: ${hint}${agent.description.trim().length > 160 ? "…" : ""}`
      : `I would answer in character once a live model is configured.`,
    ``,
    `Open Settings, paste an OpenRouter key, then pick a model on this agent to continue for real.`,
  ].join("\n");
}

type ToolCall = {
  id: string;
  type?: string;
  function?: { name?: string; arguments?: string };
};

type OrChoice = {
  message?: {
    content?: string | null;
    tool_calls?: ToolCall[];
  };
  finish_reason?: string;
};

async function callOpenRouter(opts: {
  apiKey: string;
  model: string;
  messages: unknown[];
  tools?: typeof FS_TOOLS;
}): Promise<OrChoice> {
  const body: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
    temperature: 0.7,
  };
  if (opts.tools && opts.tools.length > 0) {
    body.tools = opts.tools;
  }

  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: "POST",
    headers: openRouterHeaders(opts.apiKey),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `OpenRouter error ${res.status}: ${text.slice(0, 220)}`
    );
  }
  const data = (await res.json()) as { choices?: OrChoice[] };
  return data.choices?.[0] ?? {};
}

function parseToolArgs(raw?: string): { path?: string } {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as { path?: unknown };
    return { path: typeof parsed.path === "string" ? parsed.path : undefined };
  } catch {
    return {};
  }
}

export async function generateAssistantReply(opts: {
  agent: AgentVoice;
  history: ChatMessage[];
  userText: string;
}): Promise<LlmResult> {
  const settings = await getStudioSettings();
  const apiKey = settings.openrouterApiKey?.trim() || "";
  const toolsGranted = settings.allowedPaths.length > 0;

  if (!apiKey) {
    const content = buildOfflineReply(opts.agent, opts.userText);
    return {
      content,
      toolHints: extractToolMentions(content),
      provider: "offline",
    };
  }

  const model = opts.agent.modelId?.trim() || "openai/gpt-4o-mini";
  const system = buildSystemPrompt(opts.agent, toolsGranted);

  type OrMsg = Record<string, unknown>;
  const messages: OrMsg[] = [
    { role: "system", content: system },
    ...opts.history
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: opts.userText },
  ];

  const usedTools: string[] = [];
  const maxRounds = toolsGranted ? 4 : 1;
  let finalContent = "";

  for (let round = 0; round < maxRounds; round++) {
    const choice = await callOpenRouter({
      apiKey,
      model,
      messages,
      tools: toolsGranted ? FS_TOOLS : undefined,
    });
    const msg = choice.message;
    const toolCalls = msg?.tool_calls ?? [];
    const text = (msg?.content || "").trim();

    if (toolCalls.length === 0) {
      finalContent = text || "(empty response)";
      break;
    }

    messages.push({
      role: "assistant",
      content: msg?.content ?? "",
      tool_calls: toolCalls,
    });

    for (const call of toolCalls) {
      const name = call.function?.name || "";
      if (name) usedTools.push(name);
      const args = parseToolArgs(call.function?.arguments);
      const result = await executeFsTool(name, args);
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });
    }

    if (round === maxRounds - 1) {
      const last = await callOpenRouter({
        apiKey,
        model,
        messages,
      });
      finalContent = (last.message?.content || text || "(empty response)").trim();
    }
  }

  if (!finalContent) {
    finalContent = "(empty response)";
  }

  const hints = Array.from(
    new Set([...usedTools, ...extractToolMentions(finalContent)])
  );

  return {
    content: finalContent,
    toolHints: hints,
    provider: "openrouter",
  };
}
