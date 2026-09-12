/** Display-only tool stubs. Real integrations are not wired in the MVP. */

export const KNOWN_TOOLS = [
  { id: "code_search", label: "Code search", hint: "Scan a workspace for symbols" },
  { id: "sketch_board", label: "Sketch board", hint: "Draft layout frames" },
  { id: "test_runner", label: "Test runner", hint: "Execute a suite dry-run" },
  { id: "web_lookup", label: "Web lookup", hint: "Fetch public reference notes" },
] as const;

const TOOL_PATTERN =
  /\b(?:use|call|invoke|run)\s+(?:the\s+)?(code[_\s-]?search|sketch[_\s-]?board|test[_\s-]?runner|web[_\s-]?lookup)\b|\b\[(code_search|sketch_board|test_runner|web_lookup)\]|\bTOOL:\s*(code_search|sketch_board|test_runner|web_lookup)\b/gi;

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
  // Also catch bare known tool ids in backticks or brackets
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
  return {
    id,
    label: known?.label ?? id,
    status: "not connected" as const,
    hint: known?.hint ?? "Optional tool stub",
  };
}
