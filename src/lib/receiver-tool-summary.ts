import type { ToolLogEntry } from "./llm";

const FS_MUTATION_TOOLS = new Set(["write_file", "edit_file"]);

export function summarizeReceiverToolLog(toolLog: ToolLogEntry[]): string {
  const mutations = toolLog.filter(
    (e) => FS_MUTATION_TOOLS.has(e.name) && e.status === "ran" && e.detail
  );
  if (mutations.length === 0) return "";
  const parts = mutations.map((e) => `${e.name}: ${e.detail}`);
  return `Receiver file changes: ${parts.join("; ")}`;
}

export function appendReceiverToolSummary(reply: string, toolLog: ToolLogEntry[]): string {
  const summary = summarizeReceiverToolLog(toolLog);
  if (!summary) return reply;
  return `${reply}\n\n${summary}`;
}
