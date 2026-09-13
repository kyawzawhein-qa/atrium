import { NextRequest, NextResponse } from "next/server";
import { executeFsTool } from "@/lib/fs-tools";
import { runShellTool } from "@/lib/shell-tools";
import { ensurePluginsLoaded } from "@/lib/plugins/init";
import { executePluginTool } from "@/lib/plugins/registry";

const FS_ALLOWED = new Set(["list_dir", "read_file", "write_file", "edit_file"]);

export async function POST(req: NextRequest) {
  await ensurePluginsLoaded();
  let body: {
    tool?: string;
    path?: string;
    content?: string;
    old_string?: string;
    new_string?: string;
    replace_all?: boolean;
    command?: string;
    cwd?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const tool = body.tool?.trim() || "";

  if (tool === "run_shell") {
    const result = await runShellTool({
      command: body.command,
      cwd: body.cwd || body.path,
    });
    const rec = result as { ok?: boolean; code?: string };
    const status = rec.ok
      ? 200
      : rec.code === "not_granted" || rec.code === "outside_allowlist"
        ? 403
        : rec.code === "needs_approval"
          ? 202
          : 400;
    return NextResponse.json(result, { status });
  }

  if (!FS_ALLOWED.has(tool)) {
    const pluginResult = await executePluginTool(tool, body as Record<string, unknown>);
    if (pluginResult !== null) {
      const rec = pluginResult as { ok?: boolean };
      return NextResponse.json(pluginResult, { status: rec.ok ? 200 : 400 });
    }
    return NextResponse.json(
      {
        error:
          "tool must be list_dir, read_file, write_file, edit_file, run_shell, or a loaded plugin tool id",
      },
      { status: 400 }
    );
  }

  const result = await executeFsTool(tool, {
    path: body.path,
    content: body.content,
    old_string: body.old_string,
    new_string: body.new_string,
    replace_all: body.replace_all,
  });

  const rec = result as { ok?: boolean; code?: string };
  const status = rec.ok
    ? 200
    : rec.code === "not_granted" || rec.code === "outside_allowlist"
      ? 403
      : rec.code === "not_found"
        ? 404
        : 400;
  return NextResponse.json(result, { status });
}
