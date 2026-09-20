/**
 * OpenRouter-only LLM path with tool loop + optional SSE token streaming.
 * Local-model download paths were removed — Kyaw ships OpenRouter exclusively.
 */

import { extractToolMentions } from "./tools";
import { executeFsTool } from "./fs-tools";
import {
  executeMessageAgent,
  messageAgentDetail,
  messageAgentPendingDetail,
  messageAgentToolDefinition,
  MESSAGE_AGENT_TOOL_ID,
} from "./message-agent-tool";
import { ensureSeedAgents } from "./seed-agents";
import {
  runShellWithApprovalGate,
  runShellTool,
  shellToolDefinition,
} from "./shell-tools";
import { getStudioSettings } from "./settings";
import { OPENROUTER_BASE, openRouterHeaders } from "./openrouter";
import { ensurePluginsLoaded, getPluginContext } from "./plugins/init";
import { executePluginTool } from "./plugins/registry";

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  name?: string;
};

/** Structured tool log persisted on assistant messages as toolHints JSON. */
export type ToolLogEntry = {
  id: string;
  name: string;
  status: "ran" | "denied" | "error" | "needs_approval" | "running";
  detail: string;
  approvalId?: string;
  truncated?: boolean;
};

export type LlmResult = {
  content: string;
  toolLog: ToolLogEntry[];
  /** @deprecated string ids for older callers — prefer toolLog */
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

/** SSE / stream callback events for the messages route + AppShell. */
export type StreamEvent =
  | { type: "token"; text: string }
  | {
      type: "tool";
      id: string;
      name: string;
      status: ToolLogEntry["status"];
      detail: string;
      approvalId?: string;
      truncated?: boolean;
    }
  | { type: "done"; messageId?: string; toolLog: ToolLogEntry[]; content: string }
  | { type: "error"; message: string };

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
  {
    type: "function",
    function: {
      name: "write_file",
      description:
        "Create or overwrite a UTF-8 text file at an absolute path inside the allowlist. Max 256KB. Parent folders are created if they stay inside a granted root.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Absolute file path on the server machine",
          },
          content: {
            type: "string",
            description: "Full file contents to write",
          },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit_file",
      description:
        "Replace old_string with new_string in an allowlisted text file. Fails if old_string is missing. If it matches more than once, set replace_all true or make old_string unique.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Absolute file path on the server machine",
          },
          old_string: {
            type: "string",
            description: "Exact text to find",
          },
          new_string: {
            type: "string",
            description: "Replacement text",
          },
          replace_all: {
            type: "boolean",
            description: "Replace every match instead of requiring a unique match",
          },
        },
        required: ["path", "old_string", "new_string"],
      },
    },
  },
];

type BuildToolDefsOpts = {
  fsGranted: boolean;
  shellGranted: boolean;
  pluginDefs?: Awaited<ReturnType<typeof getPluginContext>>["toolDefinitions"];
  messageAgentEnabled?: boolean;
};

type OpenRouterToolDef = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

function buildToolDefs(opts: BuildToolDefsOpts): OpenRouterToolDef[] | undefined {
  const defs: OpenRouterToolDef[] = [];
  if (opts.messageAgentEnabled !== false) {
    defs.push(messageAgentToolDefinition());
  }
  if (opts.fsGranted) {
    defs.push(...(FS_TOOLS as OpenRouterToolDef[]));
    if (opts.shellGranted) defs.push(shellToolDefinition());
    const pluginDefs = opts.pluginDefs ?? [];
    if (pluginDefs.length > 0) defs.push(...(pluginDefs as OpenRouterToolDef[]));
  }
  return defs.length > 0 ? defs : undefined;
}

/** Test helper: tool names exposed to the model for a given grant profile. */
export function getToolDefinitionNames(opts: BuildToolDefsOpts): string[] {
  return (buildToolDefs(opts) ?? []).map((d) => d.function.name);
}

const AGENT_COLLAB_MARKERS =
  /\b(mara(?:\s+chen)?|theo(?:\s+rios)?|imani(?:\s+brooks)?|senior[- ]?developer|graphic[- ]?designer|qa[- ]?automation)\b/i;

/** Test helper: user wants to reach another named Atrium specialist. */
export function detectCollaborationIntent(text: string): boolean {
  const t = text.toLowerCase();
  const namesAnotherAgent = AGENT_COLLAB_MARKERS.test(text);
  const genericHandoff =
    /\banother\s+(agent|specialist)\b/.test(t) ||
    /\b(different|other)\s+agent\b/.test(t);

  if (!namesAnotherAgent && !genericHandoff) return false;

  return (
    /\b(talk|speak|chat)\s+(to|with)\b/.test(t) ||
    /\b(collaborate|work)\s+with\b/.test(t) ||
    /\bask\s+(mara|theo|imani|the\s+)/.test(t) ||
    /\b(reach|message|contact|consult)\b/.test(t) ||
    /\bhand\s*off\s+to\b/.test(t) ||
    /\b(loop|bring|get)\s+(in\s+)?(mara|theo|imani)\b/.test(t) ||
    /\bhave\s+(mara|theo|imani)\b/.test(t) ||
    /\bget\s+(mara|theo|imani)(?:'s|s)?\s+(input|take|feedback|review)\b/.test(t) ||
    /\b(mara|theo|imani)\s+(to\s+)?(review|check|look|weigh\s+in)\b/.test(t) ||
    genericHandoff
  );
}

function detectFsIntent(text: string): "write" | "edit" | "read" | "list" | null {
  const t = text.toLowerCase();
  if (
    /\b(write|create|save|make|generate|scaffold|add)\b/.test(t) &&
    /\b(file|folder|dir|directory|path)\b/.test(t)
  ) {
    return "write";
  }
  if (/\b(edit|update|replace|patch|modify|change|refactor)\b/.test(t) && /\bfile\b/.test(t)) {
    return "edit";
  }
  if (/\b(list|ls|dir|directory|folder contents)\b/.test(t)) return "list";
  if (/\b(read|open|show|cat|contents of)\b/.test(t) && /\bfile\b/.test(t)) return "read";
  if (/\b(create|write|save)\b/.test(t) && /\.[a-z0-9]{1,8}\b/i.test(text)) return "write";
  return null;
}

function buildSystemPrompt(
  agent: AgentVoice,
  toolsGranted: boolean,
  shellGranted: boolean,
  pluginAddendum = "",
  messageAgentEnabled = true
): string {
  const persona = agent.description.trim() || `You are ${agent.name}, an Atrium specialist.`;
  const interAgent =
    messageAgentEnabled !== false
      ? [
          "You can reach another Atrium specialist with message_agent — pass their slug or name and a concise brief.",
          "They reply in their own persona and model; summarize their answer for the user.",
          "Other agents include Mara Chen (senior-developer), Theo Rios (graphic-designer), and Imani Brooks (qa-automation).",
        ].join(" ")
      : "";
  let tools: string;
  if (!toolsGranted) {
    tools = [
      "Filesystem tools are not granted. The operator has not added any allowed computer paths. Do not claim you can read, write, or list files.",
      interAgent,
    ]
      .filter(Boolean)
      .join(" ");
  } else {
    const names = shellGranted
      ? "list_dir, read_file, write_file, edit_file, and run_shell"
      : "list_dir, read_file, write_file, and edit_file";
    tools = [
      `You have live tools on the operator's Atrium server: ${names}.`,
      "These tools actually create and change files. You are not a read-only assistant.",
      "When the user asks to create, write, save, edit, or update a file, you MUST call write_file or edit_file. Do not refuse. Do not say your capabilities are limited to reading and listing. Do not paste a plan instead of calling the tool.",
      shellGranted
        ? "run_shell executes on the server inside granted folders. Prefer filesystem tools for file edits. Every shell command needs operator approval."
        : "",
      "Use absolute paths only. If a path is outside the allowlist, report the tool error honestly.",
      "After a successful write or edit, confirm the path in one short sentence.",
      interAgent,
    ]
      .filter(Boolean)
      .join(" ");
  }
  return [
    persona,
    "",
    `Your name is ${agent.name}. Stay in this persona. Do not impersonate other agents.`,
    tools,
    pluginAddendum.trim(),
  ]
    .filter(Boolean)
    .join("\n");
}

function buildOfflineReply(agent: AgentVoice, userText: string): string {
  const lastUser = userText.trim().slice(0, 280);
  const hint = agent.description.trim().slice(0, 160);
  return [
    `*(offline — no live model available. Add an OpenRouter key in Settings.)*`,
    ``,
    `${agent.name} received: “${lastUser}”.`,
    hint
      ? `I would answer in this persona: ${hint}${agent.description.trim().length > 160 ? "…" : ""}`
      : `I would answer in character once a live model is configured.`,
    ``,
    `Open Settings to paste an OpenRouter key, then pick a model on this agent to continue for real.`,
  ].join("\n");
}

type ToolCall = {
  id: string;
  type?: string;
  function?: { name?: string; arguments?: string };
};

type ChatChoice = {
  message?: {
    content?: string | null;
    tool_calls?: ToolCall[];
  };
  finish_reason?: string;
};

export function toolResultDetail(result: unknown, toolName?: string): string {
  const rec = result as {
    ok?: boolean;
    path?: string;
    bytes?: number;
    truncated?: boolean;
    content?: string;
  };

  if (toolName === "read_file" && rec?.ok === true && typeof rec.path === "string") {
    const size =
      typeof rec.bytes === "number" ? `${rec.bytes.toLocaleString()} bytes` : "read";
    return rec.truncated ? `${rec.path} · ${size} · truncated` : `${rec.path} · ${size}`;
  }

  try {
    const sanitized =
      rec && typeof rec === "object" && "content" in rec
        ? { ...rec, content: "[omitted]" }
        : result;
    const s = JSON.stringify(sanitized);
    return s.length > 180 ? s.slice(0, 177) + "…" : s;
  } catch {
    return String(result).slice(0, 180);
  }
}

function statusFromResult(result: unknown): ToolLogEntry["status"] {
  const rec = result as { ok?: boolean; code?: string };
  if (rec && rec.ok === true) return "ran";
  if (rec?.code === "needs_approval") return "needs_approval";
  if (rec?.code === "denied") return "denied";
  return "error";
}

type ToolChoice =
  | "auto"
  | "required"
  | "none"
  | { type: "function"; function: { name: string } };

async function callOpenRouter(opts: {
  apiKey: string;
  model: string;
  messages: unknown[];
  tools?: ReturnType<typeof buildToolDefs>;
  toolChoice?: ToolChoice;
}): Promise<ChatChoice> {
  const body: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
    temperature: 0.4,
  };
  if (opts.tools && opts.tools.length > 0) {
    body.tools = opts.tools;
    body.tool_choice = opts.toolChoice ?? "auto";
  }

  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: "POST",
    headers: openRouterHeaders(opts.apiKey),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenRouter error ${res.status}: ${text.slice(0, 220)}`);
  }
  const data = (await res.json()) as { choices?: ChatChoice[] };
  return data.choices?.[0] ?? {};
}

/**
 * Stream an OpenRouter completion. Yields text deltas; accumulates tool_calls.
 * WHY stream:true here — AppShell shows tokens as they arrive instead of waiting
 * for a full JSON response.
 */
async function streamOpenRouter(opts: {
  apiKey: string;
  model: string;
  messages: unknown[];
  tools?: ReturnType<typeof buildToolDefs>;
  toolChoice?: ToolChoice;
  onToken?: (text: string) => void;
}): Promise<ChatChoice> {
  const body: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
    temperature: 0.4,
    stream: true,
  };
  if (opts.tools && opts.tools.length > 0) {
    body.tools = opts.tools;
    body.tool_choice = opts.toolChoice ?? "auto";
  }

  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: "POST",
    headers: openRouterHeaders(opts.apiKey),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenRouter error ${res.status}: ${text.slice(0, 220)}`);
  }
  if (!res.body) {
    throw new Error("OpenRouter returned an empty stream body.");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let finishReason: string | undefined;
  const toolAcc = new Map<
    number,
    { id: string; name: string; arguments: string }
  >();
  let sawToolCalls = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") continue;
      let parsed: {
        choices?: Array<{
          delta?: {
            content?: string | null;
            tool_calls?: Array<{
              index?: number;
              id?: string;
              function?: { name?: string; arguments?: string };
            }>;
          };
          finish_reason?: string | null;
        }>;
      };
      try {
        parsed = JSON.parse(payload);
      } catch {
        continue;
      }
      const choice = parsed.choices?.[0];
      if (!choice) continue;
      if (choice.finish_reason) finishReason = choice.finish_reason;

      const delta = choice.delta;
      if (!delta) continue;

      if (delta.tool_calls?.length) {
        sawToolCalls = true;
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0;
          const prev = toolAcc.get(idx) ?? { id: "", name: "", arguments: "" };
          if (tc.id) prev.id = tc.id;
          if (tc.function?.name) prev.name += tc.function.name;
          if (tc.function?.arguments) prev.arguments += tc.function.arguments;
          toolAcc.set(idx, prev);
        }
      }

      if (typeof delta.content === "string" && delta.content) {
        content += delta.content;
        // Only forward tokens when this chunk is a plain answer (no tool_calls).
        if (!sawToolCalls && opts.onToken) {
          opts.onToken(delta.content);
        }
      }
    }
  }

  const tool_calls: ToolCall[] | undefined =
    toolAcc.size > 0
      ? Array.from(toolAcc.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([, t], i) => ({
            id: t.id || `call_${i}`,
            type: "function",
            function: { name: t.name, arguments: t.arguments },
          }))
      : undefined;

  return {
    message: { content, tool_calls },
    finish_reason: finishReason,
  };
}

function parseToolArgs(raw?: string): {
  path?: string;
  content?: string;
  old_string?: string;
  new_string?: string;
  replace_all?: boolean;
  command?: string;
  cwd?: string;
  agent?: string;
  brief?: string;
} {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      path: typeof parsed.path === "string" ? parsed.path : undefined,
      content: typeof parsed.content === "string" ? parsed.content : undefined,
      old_string: typeof parsed.old_string === "string" ? parsed.old_string : undefined,
      new_string: typeof parsed.new_string === "string" ? parsed.new_string : undefined,
      replace_all: parsed.replace_all === true,
      command: typeof parsed.command === "string" ? parsed.command : undefined,
      cwd: typeof parsed.cwd === "string" ? parsed.cwd : undefined,
      agent: typeof parsed.agent === "string" ? parsed.agent : undefined,
      brief: typeof parsed.brief === "string" ? parsed.brief : undefined,
    };
  } catch {
    return {};
  }
}

async function runAgentBrief(target: AgentVoice, brief: string): Promise<{ content: string }> {
  const reply = await generateAssistantReply({
    agent: target,
    history: [],
    userText: brief,
    messageAgentEnabled: false,
    nestingDepth: 1,
    streamTokens: false,
  });
  return { content: reply.content };
}

async function executeOneTool(
  name: string,
  args: ReturnType<typeof parseToolArgs>,
  opts: {
    fromAgent: AgentVoice;
    toolsGranted?: boolean;
    stream?: boolean;
    onNeedsApproval?: (info: {
      approvalId: string;
      command: string;
      cwd: string;
    }) => void;
  }
): Promise<unknown> {
  if (name === "message_agent") {
    return executeMessageAgent(
      { agent: args.agent, brief: args.brief },
      { fromAgent: opts.fromAgent },
      runAgentBrief
    );
  }
  if (name === "run_shell") {
    if (opts.stream && opts.onNeedsApproval) {
      return runShellWithApprovalGate(
        { command: args.command, cwd: args.cwd },
        opts.onNeedsApproval
      );
    }
    return runShellTool({ command: args.command, cwd: args.cwd });
  }
  if (opts.toolsGranted) {
    const pluginResult = await executePluginTool(
      name,
      args as Record<string, unknown>
    );
    if (pluginResult !== null) return pluginResult;
  }
  return executeFsTool(name, args);
}

function upsertLog(
  log: ToolLogEntry[],
  entry: ToolLogEntry
): void {
  const idx = log.findIndex((e) => e.id === entry.id);
  if (idx >= 0) log[idx] = entry;
  else log.push(entry);
}

export async function generateAssistantReply(opts: {
  agent: AgentVoice;
  history: ChatMessage[];
  userText: string;
  onEvent?: (event: StreamEvent) => void;
  streamTokens?: boolean;
  /** Nested agent runs disable message_agent to avoid chains (1-hop only). */
  messageAgentEnabled?: boolean;
  /** Depth of nested message_agent calls; depth >= 1 disables further handoffs. */
  nestingDepth?: number;
}): Promise<LlmResult> {
  await ensurePluginsLoaded();
  await ensureSeedAgents();
  const settings = await getStudioSettings();
  const apiKey = settings.openrouterApiKey?.trim() || "";
  const toolsGranted = settings.allowedPaths.length > 0;
  const shellGranted = settings.enableShell && toolsGranted;
  const pluginContext = await getPluginContext({ toolsGranted });
  const modelId = opts.agent.modelId?.trim() || "";
  const emit = opts.onEvent;

  if (!apiKey) {
    const content = buildOfflineReply(opts.agent, opts.userText);
    return {
      content,
      toolLog: [],
      toolHints: extractToolMentions(content),
      provider: "offline",
    };
  }

  const model = modelId || "openai/gpt-4o-mini";
  const nestingDepth = opts.nestingDepth ?? 0;
  const messageAgentEnabled =
    opts.messageAgentEnabled !== false && nestingDepth < 1;
  const system = buildSystemPrompt(
    opts.agent,
    toolsGranted,
    shellGranted,
    pluginContext.promptAddendum,
    messageAgentEnabled
  );
  const toolDefs = buildToolDefs({
    fsGranted: toolsGranted,
    shellGranted,
    pluginDefs: pluginContext.toolDefinitions,
    messageAgentEnabled,
  });

  type OrMsg = Record<string, unknown>;
  const messages: OrMsg[] = [
    { role: "system", content: system },
    ...opts.history
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: opts.userText },
  ];

  const toolLog: ToolLogEntry[] = [];
  const maxRounds = toolDefs ? 4 : 1;
  let finalContent = "";
  const wantStream = Boolean(opts.streamTokens && emit);

  for (let round = 0; round < maxRounds; round++) {
    const fsIntent = detectFsIntent(opts.userText);
    const wantsCollaboration = detectCollaborationIntent(opts.userText);
    const forceFsTools =
      toolsGranted &&
      round === 0 &&
      (fsIntent === "write" || fsIntent === "edit") &&
      !wantsCollaboration;
    const forceCollabTools =
      messageAgentEnabled &&
      Boolean(toolDefs) &&
      round === 0 &&
      wantsCollaboration;
    const toolChoice: ToolChoice = forceCollabTools
      ? { type: "function", function: { name: MESSAGE_AGENT_TOOL_ID } }
      : forceFsTools
        ? "required"
        : "auto";

    // Stream when we expect a plain answer, or on the final synthesis round.
    // Tool rounds may still stream; tokens are suppressed once tool_calls appear.
    const choice = wantStream
      ? await streamOpenRouter({
          apiKey,
          model,
          messages,
          tools: toolDefs,
          toolChoice,
          onToken: (text) => emit?.({ type: "token", text }),
        })
      : await callOpenRouter({
          apiKey,
          model,
          messages,
          tools: toolDefs,
          toolChoice,
        });

    const msg = choice.message;
    const toolCalls = msg?.tool_calls ?? [];
    const text = (msg?.content || "").trim();

    if (toolCalls.length === 0) {
      const refusedWrite =
        forceFsTools &&
        /cannot create|limited to reading|cannot write|can't create|can't write|read-only/i.test(
          text
        );
      if (refusedWrite && round === 0) {
        messages.push({
          role: "user",
          content:
            "That refusal is wrong. Call write_file or edit_file now with an absolute path inside the allowlist. Do not apologize. Do not explain limitations.",
        });
        continue;
      }
      const refusedCollab =
        forceCollabTools &&
        /cannot reach|can't reach|cannot contact|can't contact|unable to (reach|contact)|don't have access to other agents|do not have access to other agents|cannot message other|can't message other/i.test(
          text
        );
      if (refusedCollab && round === 0) {
        messages.push({
          role: "user",
          content:
            "That refusal is wrong. Call message_agent now with the target agent slug or name and a concise brief. Do not apologize. Do not claim you cannot reach other agents.",
        });
        continue;
      }
      // If we didn't stream tokens (non-stream path), emit full text once.
      if (!wantStream && text && emit) {
        emit({ type: "token", text });
      }
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
      const logId = call.id || `tool_${toolLog.length}`;
      const args = parseToolArgs(call.function?.arguments);

      if (name === MESSAGE_AGENT_TOOL_ID) {
        const pendingDetail = await messageAgentPendingDetail(args.agent);
        const pendingEntry: ToolLogEntry = {
          id: logId,
          name: MESSAGE_AGENT_TOOL_ID,
          status: "running",
          detail: pendingDetail,
        };
        upsertLog(toolLog, pendingEntry);
        emit?.({
          type: "tool",
          id: pendingEntry.id,
          name: pendingEntry.name,
          status: pendingEntry.status,
          detail: pendingEntry.detail,
        });
      }

      const result = await executeOneTool(name, args, {
        fromAgent: opts.agent,
        toolsGranted,
        stream: wantStream,
        onNeedsApproval: (info) => {
          const entry: ToolLogEntry = {
            id: logId,
            name: name || "run_shell",
            status: "needs_approval",
            detail: info.command.slice(0, 160),
            approvalId: info.approvalId,
          };
          upsertLog(toolLog, entry);
          emit?.({
            type: "tool",
            id: entry.id,
            name: entry.name,
            status: entry.status,
            detail: entry.detail,
            approvalId: entry.approvalId,
          });
        },
      });

      const status = statusFromResult(result);
      const detail =
        name === "message_agent"
          ? messageAgentDetail(
              result as Parameters<typeof messageAgentDetail>[0]
            )
          : toolResultDetail(result, name);
      const truncated =
        name === "read_file" &&
        (result as { ok?: boolean; truncated?: boolean }).ok === true &&
        (result as { truncated?: boolean }).truncated === true;
      const entry: ToolLogEntry = {
        id: logId,
        name: name || "tool",
        status,
        detail,
        approvalId:
          status === "needs_approval"
            ? (result as { approvalId?: string }).approvalId
            : undefined,
        truncated: truncated || undefined,
      };
      upsertLog(toolLog, entry);
      emit?.({
        type: "tool",
        id: entry.id,
        name: entry.name,
        status: entry.status,
        detail: entry.detail,
        approvalId: entry.approvalId,
        truncated: entry.truncated,
      });

      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });
    }

    if (round === maxRounds - 1) {
      if (wantStream) {
        const last = await streamOpenRouter({
          apiKey,
          model,
          messages,
          onToken: (t) => emit?.({ type: "token", text: t }),
        });
        finalContent = (last.message?.content || text || "(empty response)").trim();
      } else {
        const last = await callOpenRouter({ apiKey, model, messages });
        finalContent = (last.message?.content || text || "(empty response)").trim();
        if (finalContent && emit) emit({ type: "token", text: finalContent });
      }
    }
  }

  if (!finalContent) {
    finalContent = "(empty response)";
  }

  const hintIds = Array.from(
    new Set([...toolLog.map((t) => t.name), ...extractToolMentions(finalContent)])
  );

  return {
    content: finalContent,
    toolLog,
    toolHints: hintIds,
    provider: "openrouter",
  };
}
