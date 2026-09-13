# Architecture

Short reference for Atrium Phase 2. Stack: **Next.js 16** (App Router), **React 19**, **Tailwind v4**, **Prisma + SQLite**, **TypeScript**.

## Local-first (no login)

There is no password gate, JWT session, or `/login` route. `/` redirects to `/chat`. OpenRouter is the only model provider.

## App routes

| Path | Purpose |
| --- | --- |
| `/` | Redirect to `/chat` |
| `/chat`, `/chat/[threadId]` | Threads and messages (SSE streaming) |
| `/agents`, `/agents/new`, `/agents/[id]/edit` | Agent CRUD |
| `/settings` | OpenRouter key, path allowlist, shell toggle |

## API routes

| Path | Purpose |
| --- | --- |
| `GET/PATCH /api/settings` | Settings singleton (`enableShell`, allowlist, key) |
| `GET/POST /api/agents`, `PATCH/DELETE /api/agents/[id]` | Agents |
| `GET/POST /api/threads`, thread/message subroutes | Chat persistence; messages support SSE |
| `GET /api/openrouter/models` | Proxied OpenRouter model list (uses saved key) |
| `POST /api/tools` | `list_dir` / `read_file` / `write_file` / `edit_file` against allowlist |
| `GET /api/operator/session` | Issue httpOnly operator cookie (same-origin shell approvals) |
| `POST /api/tools/approve` | Approve / deny pending `run_shell` (requires operator cookie + same-origin) |

## Data model (Prisma / SQLite)

```
Settings (id = "singleton")
  openrouterApiKey?
  allowedPaths          // JSON string array of absolute paths
  enableShell           // default false
  operatorToken?        // auto-generated; backs httpOnly approval cookie

ShellApproval
  id, command, cwd, status, expiresAt   // durable pending shell approvals

Agent
  slug, name, title?, description, modelId, modelName, accent
  → Thread[]

Thread
  title, agentId
  → Message[]

Message
  role, content, toolHints?   // JSON array of { id, name, status, detail }
```

## LLM + tool loop

1. Chat uses the agent's `modelId` and the saved OpenRouter key (OpenRouter only).
2. Completions: `https://openrouter.ai/api/v1` with `HTTP-Referer` and `X-Title: Atrium`. Streaming when the client requests SSE.
3. If no key is saved, an offline stub responds (no live model call).
4. When paths are granted: `list_dir`, `read_file`, `write_file`, `edit_file`. When `enableShell` is also on: `run_shell` (cwd inside allowlist; mutating → approval).
5. Write-intent turns force `tool_choice: required`. Never claim read-only.

## Key files

| Area | Location |
| --- | --- |
| OpenRouter client | `src/lib/openrouter.ts`, `src/lib/llm.ts` |
| Filesystem tools | `src/lib/fs-tools.ts`, `src/lib/tools.ts` |
| Shell + approval | `src/lib/shell-tools.ts`, `src/lib/shell-approval-store.ts`, `src/lib/operator-auth.ts`, `src/app/api/tools/approve/route.ts` |
| Settings access | `src/lib/settings.ts` |
| Schema / seed | `prisma/schema.prisma`, `prisma/seed.ts` |
