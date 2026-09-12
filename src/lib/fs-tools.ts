import fs from "node:fs/promises";
import path from "node:path";
import { getStudioSettings } from "./settings";

const MAX_LIST = 200;
const MAX_READ_BYTES = 64 * 1024;

export type ToolFailure = {
  ok: false;
  error: string;
  code: "not_granted" | "outside_allowlist" | "not_found" | "invalid" | "too_large" | "binary";
};

export type ListDirSuccess = {
  ok: true;
  path: string;
  entries: { name: string; type: "dir" | "file" }[];
  truncated: boolean;
};

export type ReadFileSuccess = {
  ok: true;
  path: string;
  content: string;
  bytes: number;
  truncated: boolean;
};

function looksAbsolute(p: string): boolean {
  if (p.startsWith("/")) return true;
  if (/^[a-zA-Z]:[\\/]/.test(p)) return true;
  if (p.startsWith("\\")) return true;
  return false;
}

export function resolveIfAllowed(
  target: string,
  allowed: string[]
): { ok: true; path: string } | ToolFailure {
  const raw = target?.trim() ?? "";
  if (!raw || raw.includes("\0")) {
    return { ok: false, error: "Invalid path.", code: "invalid" };
  }
  if (allowed.length === 0) {
    return {
      ok: false,
      error:
        "Filesystem tools are not granted. Add absolute paths in Settings → Computer path allowlist.",
      code: "not_granted",
    };
  }
  if (!looksAbsolute(raw)) {
    return {
      ok: false,
      error: "Path must be absolute (e.g. /home/you/project or C:\\Users\\you\\project).",
      code: "invalid",
    };
  }

  const resolved = path.resolve(/*turbopackIgnore: true*/ raw);
  const allowedResolved = allowed.map((a) => path.resolve(/*turbopackIgnore: true*/ a));
  const inside = allowedResolved.some((root) => {
    return resolved === root || resolved.startsWith(root + path.sep);
  });
  if (!inside) {
    return {
      ok: false,
      error: "Path is outside the granted allowlist.",
      code: "outside_allowlist",
    };
  }
  return { ok: true, path: resolved };
}

export async function listDir(target: string): Promise<ListDirSuccess | ToolFailure> {
  const settings = await getStudioSettings();
  const check = resolveIfAllowed(target, settings.allowedPaths);
  if (!check.ok) return check;

  try {
    const stat = await fs.stat(/*turbopackIgnore: true*/ check.path);
    if (!stat.isDirectory()) {
      return { ok: false, error: "Path is not a directory.", code: "invalid" };
    }
    const dirents = await fs.readdir(/*turbopackIgnore: true*/ check.path, { withFileTypes: true });
    const truncated = dirents.length > MAX_LIST;
    const entries = dirents.slice(0, MAX_LIST).map((d) => ({
      name: d.name,
      type: d.isDirectory() ? ("dir" as const) : ("file" as const),
    }));
    return { ok: true, path: check.path, entries, truncated };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return { ok: false, error: "Directory not found on the server machine.", code: "not_found" };
    }
    return { ok: false, error: "Could not list directory.", code: "invalid" };
  }
}

function isProbablyBinary(buf: Buffer): boolean {
  const sample = buf.subarray(0, Math.min(buf.length, 800));
  let suspicious = 0;
  for (const byte of sample) {
    if (byte === 0) return true;
    if (byte < 7 || (byte > 14 && byte < 32)) suspicious += 1;
  }
  return suspicious / sample.length > 0.3;
}

export async function readFileTool(target: string): Promise<ReadFileSuccess | ToolFailure> {
  const settings = await getStudioSettings();
  const check = resolveIfAllowed(target, settings.allowedPaths);
  if (!check.ok) return check;

  try {
    const stat = await fs.stat(/*turbopackIgnore: true*/ check.path);
    if (!stat.isFile()) {
      return { ok: false, error: "Path is not a file.", code: "invalid" };
    }
    if (stat.size > MAX_READ_BYTES) {
      const buf = await fs.readFile(/*turbopackIgnore: true*/ check.path);
      const slice = buf.subarray(0, MAX_READ_BYTES);
      if (isProbablyBinary(slice)) {
        return { ok: false, error: "Refusing to read a binary file.", code: "binary" };
      }
      return {
        ok: true,
        path: check.path,
        content: slice.toString("utf8"),
        bytes: slice.length,
        truncated: true,
      };
    }
    const buf = await fs.readFile(/*turbopackIgnore: true*/ check.path);
    if (isProbablyBinary(buf)) {
      return { ok: false, error: "Refusing to read a binary file.", code: "binary" };
    }
    return {
      ok: true,
      path: check.path,
      content: buf.toString("utf8"),
      bytes: buf.length,
      truncated: false,
    };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return { ok: false, error: "File not found on the server machine.", code: "not_found" };
    }
    return { ok: false, error: "Could not read file.", code: "invalid" };
  }
}

export async function executeFsTool(
  name: string,
  args: { path?: string }
): Promise<unknown> {
  const target = args.path ?? "";
  if (name === "list_dir") return listDir(target);
  if (name === "read_file") return readFileTool(target);
  return { ok: false, error: `Unknown tool: ${name}`, code: "invalid" };
}
