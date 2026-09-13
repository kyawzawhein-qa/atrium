import fs from "node:fs/promises";
import path from "node:path";
import { getStudioSettings } from "./settings";

const MAX_LIST = 200;
const MAX_READ_BYTES = 64 * 1024;
const MAX_WRITE_BYTES = 256 * 1024;

export type ToolFailure = {
  ok: false;
  error: string;
  code:
    | "not_granted"
    | "outside_allowlist"
    | "not_found"
    | "invalid"
    | "too_large"
    | "binary"
    | "not_unique";
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

export type WriteFileSuccess = {
  ok: true;
  path: string;
  bytes: number;
  created: boolean;
};

export type EditFileSuccess = {
  ok: true;
  path: string;
  replacements: number;
};

function looksAbsolute(p: string): boolean {
  if (p.startsWith("/")) return true;
  if (/^[a-zA-Z]:[\\/]/.test(p)) return true;
  if (p.startsWith("\\\\")) return true;
  return false;
}

function fold(p: string): string {
  return process.platform === "win32" ? p.toLowerCase() : p;
}

function isInsideRoot(resolved: string, root: string): boolean {
  const a = fold(resolved);
  const b = fold(root);
  return a === b || a.startsWith(b + path.sep);
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
  const inside = allowedResolved.some((root) => isInsideRoot(resolved, root));
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

export async function writeFileTool(
  target: string,
  content: string
): Promise<WriteFileSuccess | ToolFailure> {
  const settings = await getStudioSettings();
  const check = resolveIfAllowed(target, settings.allowedPaths);
  if (!check.ok) return check;
  if (typeof content !== "string") {
    return { ok: false, error: "Content must be a string.", code: "invalid" };
  }
  const buf = Buffer.from(content, "utf8");
  if (buf.length > MAX_WRITE_BYTES) {
    return {
      ok: false,
      error: `Write is limited to ${MAX_WRITE_BYTES} bytes.`,
      code: "too_large",
    };
  }

  const parent = path.dirname(check.path);
  const parentCheck = resolveIfAllowed(parent, settings.allowedPaths);
  if (!parentCheck.ok) return parentCheck;

  try {
    let created = true;
    try {
      const stat = await fs.stat(/*turbopackIgnore: true*/ check.path);
      if (stat.isDirectory()) {
        return { ok: false, error: "Path is a directory.", code: "invalid" };
      }
      created = false;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        return { ok: false, error: "Could not write file.", code: "invalid" };
      }
    }
    await fs.mkdir(/*turbopackIgnore: true*/ parent, { recursive: true });
    await fs.writeFile(/*turbopackIgnore: true*/ check.path, buf);
    return { ok: true, path: check.path, bytes: buf.length, created };
  } catch {
    return { ok: false, error: "Could not write file.", code: "invalid" };
  }
}

export async function editFileTool(
  target: string,
  oldString: string,
  newString: string,
  replaceAll = false
): Promise<EditFileSuccess | ToolFailure> {
  if (!oldString) {
    return { ok: false, error: "old_string is required.", code: "invalid" };
  }
  if (oldString === newString) {
    return { ok: false, error: "old_string and new_string are the same.", code: "invalid" };
  }
  const current = await readFileTool(target);
  if (!current.ok) return current;
  if (current.truncated) {
    return {
      ok: false,
      error: "File is too large to edit in one pass.",
      code: "too_large",
    };
  }

  const matches = current.content.split(oldString).length - 1;
  if (matches === 0) {
    return { ok: false, error: "old_string was not found in the file.", code: "not_found" };
  }
  if (matches > 1 && !replaceAll) {
    return {
      ok: false,
      error: `old_string matched ${matches} times. Pass replace_all=true or make it unique.`,
      code: "not_unique",
    };
  }

  const next = replaceAll
    ? current.content.split(oldString).join(newString)
    : current.content.replace(oldString, newString);
  const written = await writeFileTool(target, next);
  if (!written.ok) return written;
  return { ok: true, path: written.path, replacements: replaceAll ? matches : 1 };
}

export type FsToolArgs = {
  path?: string;
  content?: string;
  old_string?: string;
  new_string?: string;
  replace_all?: boolean;
};

export async function executeFsTool(name: string, args: FsToolArgs): Promise<unknown> {
  const target = args.path ?? "";
  if (name === "list_dir") return listDir(target);
  if (name === "read_file") return readFileTool(target);
  if (name === "write_file") return writeFileTool(target, args.content ?? "");
  if (name === "edit_file") {
    return editFileTool(
      target,
      args.old_string ?? "",
      args.new_string ?? "",
      Boolean(args.replace_all)
    );
  }
  return { ok: false, error: `Unknown tool: ${name}`, code: "invalid" };
}
