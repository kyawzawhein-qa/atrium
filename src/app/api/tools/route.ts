import { NextRequest, NextResponse } from "next/server";
import { listDir, readFileTool } from "@/lib/fs-tools";

export async function POST(req: NextRequest) {
  let body: { tool?: string; path?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const tool = body.tool?.trim();
  const target = body.path ?? "";
  if (tool !== "list_dir" && tool !== "read_file") {
    return NextResponse.json(
      { error: "tool must be list_dir or read_file" },
      { status: 400 }
    );
  }

  const result =
    tool === "list_dir" ? await listDir(target) : await readFileTool(target);

  const status = result.ok
    ? 200
    : result.code === "not_granted" || result.code === "outside_allowlist"
      ? 403
      : result.code === "not_found"
        ? 404
        : 400;
  return NextResponse.json(result, { status });
}
