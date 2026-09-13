/** Contract for drop-in Atrium plugins (see plugins/README.md). */

export type PluginToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type PluginToolMeta = {
  id: string;
  label: string;
  hint: string;
  definition: PluginToolDefinition;
};

export type PluginToolHandler = (
  args: Record<string, unknown>
) => Promise<unknown> | unknown;

export type AtriumPluginManifest = {
  id: string;
  name: string;
  description: string;
  /** Appended to the agent system prompt when the plugin is loaded. */
  promptAddendum?: string;
};

export type AtriumPlugin = AtriumPluginManifest & {
  tools?: Array<
    PluginToolMeta & {
      execute: PluginToolHandler;
    }
  >;
};

export type LoadedPlugin = AtriumPlugin & {
  sourceDir: string;
};
