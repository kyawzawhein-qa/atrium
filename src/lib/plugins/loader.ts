import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { AtriumPlugin, AtriumPluginManifest, LoadedPlugin } from "./types";

const MANIFEST = "plugin.json";
const MODULE_CANDIDATES = ["index.mjs", "index.js", "index.ts"] as const;

function pluginsRoot(customRoot?: string): string {
  return customRoot ?? path.join(process.cwd(), "plugins");
}

function parseManifest(raw: string, sourceDir: string): AtriumPluginManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON in ${path.join(sourceDir, MANIFEST)}`);
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`plugin.json must be an object (${sourceDir})`);
  }
  const rec = parsed as Record<string, unknown>;
  const id = typeof rec.id === "string" ? rec.id.trim() : "";
  const name = typeof rec.name === "string" ? rec.name.trim() : "";
  const description =
    typeof rec.description === "string" ? rec.description.trim() : "";
  if (!id || !name || !description) {
    throw new Error(
      `plugin.json requires id, name, and description (${sourceDir})`
    );
  }
  const promptAddendum =
    typeof rec.promptAddendum === "string"
      ? rec.promptAddendum.trim()
      : undefined;
  return {
    id,
    name,
    description,
    ...(promptAddendum ? { promptAddendum } : {}),
  };
}

async function loadModuleTools(sourceDir: string): Promise<AtriumPlugin["tools"]> {
  for (const file of MODULE_CANDIDATES) {
    const modPath = path.join(sourceDir, file);
    try {
      const info = await stat(modPath);
      if (!info.isFile()) continue;
    } catch {
      continue;
    }
    const mod = (await import(pathToFileURL(modPath).href)) as {
      default?: AtriumPlugin;
      plugin?: AtriumPlugin;
      tools?: AtriumPlugin["tools"];
    };
    const plugin = mod.default ?? mod.plugin;
    if (plugin?.tools?.length) return plugin.tools;
    if (mod.tools?.length) return mod.tools;
    return undefined;
  }
  return undefined;
}

export async function loadPluginsFromDir(
  rootDir = pluginsRoot()
): Promise<LoadedPlugin[]> {
  let entries: string[];
  try {
    entries = await readdir(rootDir);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return [];
    throw err;
  }

  const plugins: LoadedPlugin[] = [];
  for (const entry of entries) {
    const sourceDir = path.join(rootDir, entry);
    let dirStat;
    try {
      dirStat = await stat(sourceDir);
    } catch {
      continue;
    }
    if (!dirStat.isDirectory()) continue;

    const manifestPath = path.join(sourceDir, MANIFEST);
    let manifestRaw: string;
    try {
      manifestRaw = await readFile(manifestPath, "utf8");
    } catch {
      continue;
    }

    const manifest = parseManifest(manifestRaw, sourceDir);
    const tools = await loadModuleTools(sourceDir);
    plugins.push({
      ...manifest,
      ...(tools?.length ? { tools } : {}),
      sourceDir,
    });
  }

  plugins.sort((a, b) => a.id.localeCompare(b.id));
  return plugins;
}
