import { registerPluginTools } from "../tools";
import { getPluginPromptAddendum, getPluginToolDefinitions, getPluginToolMetas } from "./registry";

let initialized = false;

/** Load drop-in plugins from ./plugins and register tool metadata once per process. */
export async function ensurePluginsLoaded(): Promise<void> {
  if (initialized) return;
  await getPluginToolMetas(); // warms loader cache
  registerPluginTools(await getPluginToolMetas());
  initialized = true;
}

export async function getPluginContext(opts?: {
  toolsGranted?: boolean;
}): Promise<{
  promptAddendum: string;
  toolDefinitions: Awaited<ReturnType<typeof getPluginToolDefinitions>>;
}> {
  await ensurePluginsLoaded();
  const toolsGranted = opts?.toolsGranted ?? false;
  return {
    promptAddendum: await getPluginPromptAddendum(),
    toolDefinitions: toolsGranted ? await getPluginToolDefinitions() : [],
  };
}

/** Test helper */
export function resetPluginInit(): void {
  initialized = false;
}
