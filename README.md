# Atrium

**Atrium** is Kyaw Zaw Hein’s own-brand multi-agent chat assistant — a calm “studio desk” for switching between specialist agents in one place.

This is an original product (layout, copy, prompts, and branding). It is not a clone of Grok Bot, Cursor, ChatGPT, or xAI.

## Phase 1 — what you can do

1. **Paste an OpenRouter API key** in Settings. It is stored in the SQLite `Settings` singleton, never in git.
2. **Create custom agents** one by one: name, description (this *is* the persona / system prompt), and a model from that key.
3. **Chat** — each agent’s completions go to `https://openrouter.ai/api/v1` with the saved key and that agent’s `modelId`.
4. **Grant computer paths** — add absolute folders Atrium may touch. `list_dir` and `read_file` reject anything outside the allowlist. If no paths are granted, those tools stay unavailable.

## Stack

- Next.js App Router + TypeScript
- Tailwind CSS v4
- Prisma + SQLite
- Session cookie auth (`jose` signed JWT)
- OpenRouter for chat (`Authorization: Bearer`, `HTTP-Referer`, `X-Title: Atrium`)

## Quick start

```bash
npm install
cp .env.example .env
npm run db:setup
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), sign in with the studio password.

### Login

| Variable | Default (local demo) |
| --- | --- |
| `ATRIUM_PASSWORD` | `atrium` |

Copy `.env.example` → `.env` and adjust as needed. Session cookies are signed with `ATRIUM_SESSION_SECRET`.

**Do not put the OpenRouter key in `.env`.** Paste it in the app.

## Phase 1 setup (first run)

1. Sign in.
2. Open **Settings**.
3. Paste your OpenRouter API key and save. After save, the field shows a masked preview (`sk-o••••abcd`). You can replace or remove it anytime.
4. Open **Agents → New agent**.
   - Name (slug is generated automatically)
   - Description — used as the system prompt / persona
   - Model — loaded from `GET /api/openrouter/models` (proxies OpenRouter `GET /api/v1/models` with the saved key). The list prefers chat-capable models when the API marks them. Shown as **name — id**.
5. Start a chat. Completions use that agent’s `modelId`.
6. Optionally grant folders under **Computer path allowlist**.

### If there is no key

The UI shows: **Add OpenRouter key to create agents and chat for real.**  
Chat still works with an offline stub that says the key is missing. No hardcoded Mara / Theo / Imani voice lock — the stub uses the agent’s name and description.

## Computer path allowlist (important)

Filesystem tools run **on the machine hosting the Atrium server**, not in the browser and not on a remote operator’s laptop unless that is the same machine.

- Add absolute paths only (`/home/you/work`, `C:\Users\you\Documents`).
- Stored as a JSON string array on the Settings row.
- `list_dir` and `read_file` resolve the target and reject anything outside a granted root (including `..` traversal).
- Empty allowlist → tools return **not granted**.
- Text files only; reads cap at 64KB; directory listings cap at 200 entries.

When the model is live and paths are granted, Atrium offers those two tools via OpenRouter function calling.

## Data model

**Settings** (singleton `id = "singleton"`)

- `openrouterApiKey` — optional string
- `allowedPaths` — JSON string array of absolute paths

**Agent**

- `name`, `description` (persona), `modelId`, `modelName` (display)
- `slug` auto-generated from name
- optional `title` / `accent` (seeded specialists keep a short role label)
- Seeded demo agents remain and **are deletable**. New creates are first-class.

## LLM (`src/lib/llm.ts`)

1. **OpenRouter** when a key is saved — `https://openrouter.ai/api/v1/chat/completions`, model = `agent.modelId` (fallback `openai/gpt-4o-mini` if unset).
2. **Offline stub** only if no key.

The API key is never written to logs.

## Routes

| Path | Purpose |
| --- | --- |
| `/settings` | API key + path allowlist |
| `/agents` | List / delete agents |
| `/agents/new` | Create agent |
| `/agents/[id]/edit` | Edit agent |
| `/chat` | Threads |
| `GET /api/openrouter/models` | Proxied model list |
| `POST /api/tools` | `{ tool: "list_dir" \| "read_file", path }` |

## Seeded demo agents

| Agent | Role |
| --- | --- |
| Mara Chen | Senior Developer |
| Theo Rios | Graphic Designer |
| Imani Brooks | QA Automation |

These are ordinary rows. Edit or delete them like any custom agent.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run db:setup` | generate client + push schema + seed |
| `npx prisma db push` | apply schema to SQLite |
| `npm run dev` | local server |
| `npm run build` | production build |
| `npm start` | serve production build |

## Visual notes

Coastal-ink palette: deep ink panels, foam text, teal coastal accents. Distinctive serif wordmark + humanist UI type — not patterned after popular AI chat UIs.
