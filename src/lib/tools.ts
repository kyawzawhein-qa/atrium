/** Tool metadata + mention extraction. Filesystem tools are implemented in fs-tools.ts; shell in shell-tools.ts. */

import type { PluginToolMeta } from "./plugins/types";

export const CORE_TOOLS = [
  {
    id: "list_dir",
    label: "List directory",
    hint: "List files inside a granted absolute path on the server machine",
  },
  {
    id: "read_file",
    label: "Read file",
    hint: "Read a text file inside a granted absolute path on the server machine",
  },
  {
    id: "write_file",
    label: "Write file",
    hint: "Create or overwrite a text file inside a granted path",
  },
  {
    id: "edit_file",
    label: "Edit file",
    hint: "Replace text in a granted file (unique match, or replace_all)",
  },
  {
    id: "run_shell",
    label: "Shell",
    hint: "Run an allowlisted shell command (mutating needs approval)",
  },
  {
    id: "message_agent",
    label: "Message agent",
    hint: "Send a brief to another Atrium agent and receive their reply",
  },
  { id: "code_search", label: "Code search", hint: "Scan a workspace for symbols" },
  { id: "sketch_board", label: "Sketch board", hint: "Draft layout frames" },
  { id: "test_runner", label: "Test runner", hint: "Execute a suite dry-run" },
  { id: "web_lookup", label: "Web lookup", hint: "Fetch public reference notes" },
] as const;

const CORE_LIVE_IDS = new Set([
  "list_dir",
  "read_file",
  "write_file",
  "edit_file",
  "run_shell",
  "message_agent",
]);

const CORE_TOOL_PATTERN =
  /\b(?:use|call|invoke|run)\s+(?:the\s+)?(list[_\s-]?dir|read[_\s-]?file|write[_\s-]?file|edit[_\s-]?file|run[_\s-]?shell|message[_\s-]?agent|code[_\s-]?search|sketch[_\s-]?board|test[_\s-]?runner|web[_\s-]?lookup)\b|\b\[(list_dir|read_file|write_file|edit_file|run_shell|message_agent|code_search|sketch_board|test_runner|web_lookup)\]|\bTOOL:\s*(list_dir|read_file|write_file|edit_file|run_shell|message_agent|code_search|sketch_board|test_runner|web_lookup)\b/gi;

/** Core + dynamically loaded plugin tools (see src/lib/plugins/). */
export let KNOWN_TOOLS: ReadonlyArray<{
  id: string;
  label: string;
  hint: string;
}> = CORE_TOOLS;

let liveToolIds = new Set<string>(CORE_LIVE_IDS);
let mentionPattern = CORE_TOOL_PATTERN;

export function registerPluginTools(metas: PluginToolMeta[]): void {
  KNOWN_TOOLS = [
    ...CORE_TOOLS,
    ...metas.map((m) => ({ id: m.id, label: m.label, hint: m.hint })),
  ];
  liveToolIds = new Set([
    ...CORE_LIVE_IDS,
    ...metas.map((m) => m.id),
  ]);
  const pluginIds = metas.map((m) => m.id.replace(/_/g, "[_\\s-]?")).join("|");
  if (pluginIds) {
    mentionPattern = new RegExp(
      `${CORE_TOOL_PATTERN.source}|\\b(?:use|call|invoke|run)\\s+(?:the\\s+)?(${pluginIds})\\b|\\b\\[(${pluginIds})\\]|\\bTOOL:\\s*(${pluginIds})\\b`,
      CORE_TOOL_PATTERN.flags
    );
  } else {
    mentionPattern = CORE_TOOL_PATTERN;
  }
}

function normalizeToolId(raw: string): string {
  return raw.toLowerCase().replace(/[\s-]+/g, "_");
}

export function extractToolMentions(text: string): string[] {
  const found = new Set<string>();
  let match: RegExpExecArray | null;
  const re = new RegExp(mentionPattern.source, mentionPattern.flags);
  while ((match = re.exec(text)) !== null) {
    const raw = match[1] || match[2] || match[3];
    if (raw) found.add(normalizeToolId(raw));
  }
  for (const tool of KNOWN_TOOLS) {
    if (
      text.includes(`\`${tool.id}\``) ||
      text.includes(`[${tool.id}]`) ||
      text.includes(`TOOL:${tool.id}`)
    ) {
      found.add(tool.id);
    }
  }
  return Array.from(found);
}

export function toolDisplay(id: string) {
  const known = KNOWN_TOOLS.find((t) => t.id === id);
  const live = liveToolIds.has(id);
  return {
    id,
    label: known?.label ?? id,
    status: live ? ("allowlisted" as const) : ("not connected" as const),
    hint: known?.hint ?? "Optional tool stub",
  };
}
