# Atrium

**Atrium** is Kyaw Zaw Hein’s own-brand multi-agent chat assistant — a calm “studio desk” for switching between specialist agents in one place.

This is an original product (layout, copy, prompts, and branding). It is not a clone of Grok Bot, Cursor, ChatGPT, or xAI.

## Stack

- Next.js App Router + TypeScript
- Tailwind CSS v4
- Prisma + SQLite
- Session cookie auth (`jose` signed JWT)

## Quick start

```bash
npm install
npm run db:setup
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), sign in with the studio password, and start a thread.

### Login

| Variable | Default (local demo) |
| --- | --- |
| `ATRIUM_PASSWORD` | `atrium` |

Copy `.env.example` → `.env` and adjust as needed. Session cookies are signed with `ATRIUM_SESSION_SECRET`.

## Agents (seeded)

| Agent | Role |
| --- | --- |
| Mara Chen | Senior Developer |
| Theo Rios | Graphic Designer |
| Imani Brooks | QA Automation |

Each has an original system prompt stored in the database.

## Chat MVP

- Left rail: thread list (create / open / delete)
- Main pane: conversation
- Header: agent switcher (changes the active specialist for the thread)
- Messages persist (user + assistant) in SQLite

## LLM adapter (`src/lib/llm.ts`)

Resolution order:

1. **`OPENAI_API_KEY`** — OpenAI-compatible `/chat/completions` (optional `OPENAI_BASE_URL`, `OPENAI_MODEL`)
2. Else **`OLLAMA_BASE_URL`** — Ollama `/api/chat` (optional `OLLAMA_MODEL`)
3. Else **offline stub** — agent-voiced demo replies (clearly marked `*(offline demo — no LLM key configured)*` in the message)

### Plug in a real model

```bash
# OpenAI or compatible gateway
export OPENAI_API_KEY=sk-...
# optional:
# export OPENAI_BASE_URL=https://api.openai.com/v1
# export OPENAI_MODEL=gpt-4o-mini

# or Ollama
export OLLAMA_BASE_URL=http://127.0.0.1:11434
# export OLLAMA_MODEL=llama3.2
```

Restart `npm run dev` after changing env vars.

## Tool chips (display stubs)

If an assistant reply mentions a known tool id (`code_search`, `sketch_board`, `test_runner`, `web_lookup`), Atrium shows a chip. Invocations are **not connected** in the MVP — chips read “not connected”.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run db:setup` | generate client + push schema + seed agents |
| `npm run dev` | local server |
| `npm run build` | production build |
| `npm start` | serve production build |

## Visual notes

Coastal-ink palette: deep ink panels, foam text, teal coastal accents. Distinctive serif wordmark + humanist UI type — not patterned after popular AI chat UIs.
