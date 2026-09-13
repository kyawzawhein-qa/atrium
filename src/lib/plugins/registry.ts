import type {
  AtriumPlugin,
  LoadedPlugin,
  PluginToolDefinition,
  PluginToolMeta,
} from "./types";
import { loadPluginsFromDir } from "./loader";

let cached: LoadedPlugin[] | null = null;
let loadPromise: Promise<LoadedPlugin[]> | null = null;

export async function getLoadedPlugins(): Promise<LoadedPlugin[]> {
  if (cached) return cached;
  if (!loadPromise) {
    loadPromise = loadPluginsFromDir().then((plugins) => {
      cached = plugins;
      return plugins;
    });
  }
  return loadPromise;
}

/** Test helper — point the loader at a temp directory and clear cache. */
export function resetPluginCache(rootDir?: string): void {
  cached = null;
  loadPromise = rootDir
    ? loadPluginsFromDir(rootDir).then((plugins) => {
        cached = plugins;
        return plugins;
      })
    : null;
}

export async function getPluginPromptAddendum(): Promise<string> {
  const plugins = await getLoadedPlugins();
  const parts = plugins
    .map((p) => p.promptAddendum?.trim())
    .filter(Boolean) as string[];
  if (parts.length === 0) return "";
  return parts.join("\n\n");
}

export async function getPluginToolMetas(): Promise<PluginToolMeta[]> {
  const plugins = await getLoadedPlugins();
  const metas: PluginToolMeta[] = [];
  for (const plugin of plugins) {
    for (const tool of plugin.tools ?? []) {
      metas.push({
        id: tool.id,
        label: tool.label,
        hint: tool.hint,
        definition: tool.definition,
      });
    }
  }
  return metas;
}

export async function getPluginToolDefinitions(): Promise<PluginToolDefinition[]> {
  const metas = await getPluginToolMetas();
  return metas.map((m) => m.definition);
}

export async function executePluginTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown | null> {
  const plugins = await getLoadedPlugins();
  for (const plugin of plugins) {
    for (const tool of plugin.tools ?? []) {
      if (tool.id === name) {
        return tool.execute(args);
      }
    }
  }
  return null;
}

export function isPluginToolId(id: string, plugins: AtriumPlugin[]): boolean {
  return plugins.some((p) => p.tools?.some((t) => t.id === id));
}
