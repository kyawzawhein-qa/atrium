# Architecture

Short reference for Phase 1 of Atrium. Stack: **Next.js 16** (App Router), **React 19**, **Tailwind v4**, **Prisma + SQLite**, **TypeScript**.

## Auth gate

Next.js 16 uses `src/proxy.ts` (not `middleware.ts`) to protect studio pages.

- Protected pages: `/chat`, `/settings`, `/agents`
- Public: `/login` (and redirects from `/`)
- Session: jose-signed JWT cookie (`atrium_session`), password from `ATRIUM_PASSWORD`

## App routes

| Path | Purpose |
| --- | --- |
| `/` | Redirect to `/chat` or `/login` |
| `/login` | Studio password form |
| `/chat`, `/chat/[threadId]` | Threads and messages |
| `/agents`, `/agents/new`, `/agents/[id]/edit` | Agent CRUD |
| `/settings` | OpenRouter key + path allowlist |

## API routes

| Path | Purpose |
| --- | --- |
| `POST /api/auth/login`, `POST /api/auth/logout` | Session cookie |
| `GET/PATCH /api/settings` | Settings singleton |
| `GET/POST /api/agents`, `PATCH/DELETE /api/agents/[id]` | Agents |
| `GET/POST /api/threads`, thread/message subroutes | Chat persistence |
| `GET /api/openrouter/models` | Proxied OpenRouter model list (uses saved key) |
| `POST /api/tools` | `list_dir` / `read_file` / `write_file` / `edit_file` against allowlist |

## Data model (Prisma / SQLite)

```
Settings (id = "singleton")
  openrouterApiKey?
  allowedPaths          // JSON string array of absolute paths

Agent
  slug, name, title?, description, modelId, modelName, accent
  → Thread[]

Thread
  title, agentId
  → Message[]

Message
  role, content, toolHints?
```

## LLM path

1. Chat uses the agent's `modelId` and the saved OpenRouter key.
2. Completions: `https://openrouter.ai/api/v1` with `HTTP-Referer` and `X-Title: Atrium`.
3. If no key is saved, an offline stub responds (no live model call).
4. When paths are granted, `list_dir`, `read_file`, `write_file`, and `edit_file` are offered via function calling. Tools execute on the **server machine**.

## Key files

| Area | Location |
| --- | --- |
| Auth helpers | `src/lib/auth.ts` |
| OpenRouter client | `src/lib/openrouter.ts`, `src/lib/llm.ts` |
| Filesystem tools | `src/lib/fs-tools.ts`, `src/lib/tools.ts` |
| Settings access | `src/lib/settings.ts` |
| Schema / seed | `prisma/schema.prisma`, `prisma/seed.ts` |
