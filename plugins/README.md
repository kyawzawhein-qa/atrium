# Atrium plugins

Drop a folder here to extend Atrium without editing core agent code. Atrium scans `plugins/*/plugin.json` at server startup and optionally loads tool modules from your plugin folder.

## Quick start

Copy the included example:

```text
plugins/
  hello-world/
    plugin.json      # required metadata + optional prompt addendum
    index.mjs          # optional tool handlers (recommended)
```

Restart the dev server after adding or changing a plugin.

## Hook contract

Each plugin is a directory with a required manifest:

### `plugin.json` (required)

| Field | Type | Required | Purpose |
| --- | --- | --- | --- |
| `id` | string | yes | Stable slug (`hello-world`, `my-team-notes`) |
| `name` | string | yes | Human label shown in docs |
| `description` | string | yes | One-line summary |
| `promptAddendum` | string | no | Text appended to every agent system prompt |

### Optional module (`index.mjs` recommended)

Export tool handlers from `index.mjs`:

```javascript
export const tools = [
  {
    id: "my_tool",           // snake_case, unique across plugins
    label: "My tool",
    hint: "Short UI hint",
    definition: {            // OpenRouter function schema
      type: "function",
      function: {
        name: "my_tool",
        description: "What the model should know",
        parameters: { type: "object", properties: { /* … */ } },
      },
    },
    execute: async (args) => ({ ok: true, result: args }),
  },
];
```

Or export a default plugin object with a `tools` array.

**Production loading:** At runtime in production (`NODE_ENV=production`), only `index.mjs` is loaded. During local dev, `index.js` and `index.ts` are also tried. Ship compiled `.mjs` for production plugins.

There is **no remote plugin install** — plugins are trusted local code you place in this folder on the machine running Atrium.

### What Atrium wires automatically

- **Prompt** — `promptAddendum` from every loaded plugin is appended in `buildSystemPrompt`.
- **Tool metadata** — plugin tools appear in `KNOWN_TOOLS` / tool chips once registered.
- **LLM loop** — tool definitions are sent to OpenRouter **only when the operator has granted at least one allowlisted path** (same gate as filesystem tools).
- **REST** — `POST /api/tools` runs plugin handlers only when the allowlist is non-empty.

### Security / trust model

- Plugins are **trusted local code** — same trust level as editing `src/`. There is no marketplace or remote install path.
- Plugin tool handlers run on the Atrium server process. Do not drop in untrusted folders.
- Filesystem and shell tools still require path allowlist + shell approval; plugin tools that touch disk should call the same helpers (`fs-tools`, `shell-tools`).
- Prompt-only plugins (manifest without tools) are the safest good-first PR.

## Good first PR

1. Fork [kyawzawhein-qa/atrium](https://github.com/kyawzawhein-qa/atrium).
2. Add `plugins/your-plugin/plugin.json` (+ optional `index.mjs`).
3. Run `npm test` and `npm run lint`.
4. Open a PR describing the plugin and how you tested it.

Prompt-only plugins (manifest only, no module) are welcome for copy, checklists, or persona addenda.

See [CONTRIBUTING.md](../CONTRIBUTING.md) for setup and review expectations.
