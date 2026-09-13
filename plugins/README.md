# Atrium plugins

Drop a folder here to extend Atrium without editing core agent code. Atrium scans `plugins/*/plugin.json` at server startup and optionally loads `index.mjs`, `index.js`, or `index.ts` for custom tools.

## Quick start

Copy the included example:

```text
plugins/
  hello-world/
    plugin.json      # required metadata + optional prompt addendum
    index.mjs          # optional tool handlers
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

Export tool handlers from `index.mjs`, `index.js`, or `index.ts`:

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

### What Atrium wires automatically

- **Prompt** — `promptAddendum` from every loaded plugin is appended in `buildSystemPrompt`.
- **Tool metadata** — plugin tools appear in `KNOWN_TOOLS` / tool chips.
- **LLM loop** — definitions are sent to OpenRouter; calls dispatch to your `execute` handler.
- **REST** — `POST /api/tools` accepts plugin tool ids (no filesystem allowlist required unless your tool touches disk).

### Security notes

- Plugin tools run on the Atrium server with the same trust model as built-in tools.
- Do not weaken path allowlist checks in core when adding filesystem plugins.
- Shell access still flows through the existing approve/deny gate.

## Good first PR

1. Fork [kyawzawhein-qa/atrium](https://github.com/kyawzawhein-qa/atrium).
2. Add `plugins/your-plugin/plugin.json` (+ optional `index.mjs`).
3. Run `npm test` and `npm run lint`.
4. Open a PR describing the plugin and how you tested it.

Prompt-only plugins (manifest only, no module) are welcome for copy, checklists, or persona addenda.

See [CONTRIBUTING.md](../CONTRIBUTING.md) for setup and review expectations.
