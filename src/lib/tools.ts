/** Tool metadata + mention extraction. Filesystem tools are implemented in fs-tools.ts; shell in shell-tools.ts. */

export const KNOWN_TOOLS = [
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
  { id: "code_search", label: "Code search", hint: "Scan a workspace for symbols" },
  { id: "sketch_board", label: "Sketch board", hint: "Draft layout frames" },
  { id: "test_runner", label: "Test runner", hint: "Execute a suite dry-run" },
  { id: "web_lookup", label: "Web lookup", hint: "Fetch public reference notes" },
] as const;

const LIVE_IDS = new Set([
  "list_dir",
  "read_file",
  "write_file",
  "edit_file",
  "run_shell",
]);

const TOOL_PATTERN =
  /\b(?:use|call|invoke|run)\s+(?:the\s+)?(list[_\s-]?dir|read[_\s-]?file|write[_\s-]?file|edit[_\s-]?file|run[_\s-]?shell|code[_\s-]?search|sketch[_\s-]?board|test[_\s-]?runner|web[_\s-]?lookup)\b|\b\[(list_dir|read_file|write_file|edit_file|run_shell|code_search|sketch_board|test_runner|web_lookup)\]|\bTOOL:\s*(list_dir|read_file|write_file|edit_file|run_shell|code_search|sketch_board|test_runner|web_lookup)\b/gi;

function normalizeToolId(raw: string): string {
  return raw.toLowerCase().replace(/[\s-]+/g, "_");
}

export function extractToolMentions(text: string): string[] {
  const found = new Set<string>();
  let match: RegExpExecArray | null;
  const re = new RegExp(TOOL_PATTERN.source, TOOL_PATTERN.flags);
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
  const live = LIVE_IDS.has(id);
  return {
    id,
    label: known?.label ?? id,
    status: live ? ("allowlisted" as const) : ("not connected" as const),
    hint: known?.hint ?? "Optional tool stub",
  };
}
