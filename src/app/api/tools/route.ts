import { NextRequest, NextResponse } from "next/server";
import { executeFsTool } from "@/lib/fs-tools";

const ALLOWED = new Set(["list_dir", "read_file", "write_file", "edit_file"]);

export async function POST(req: NextRequest) {
  let body: {
    tool?: string;
    path?: string;
    content?: string;
    old_string?: string;
    new_string?: string;
    replace_all?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const tool = body.tool?.trim() || "";
  if (!ALLOWED.has(tool)) {
    return NextResponse.json(
      { error: "tool must be list_dir, read_file, write_file, or edit_file" },
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
