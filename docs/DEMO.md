# 45-second launch demo

This script shows Atrium’s two headline tools on your machine: **write_file** (creates a real file) and **run_shell** (shows the Approve / Deny chip). You need an OpenRouter key pasted in Settings.

## Before you start (~30 seconds once)

```bash
git clone https://github.com/kyawzawhein-qa/atrium.git
cd atrium
npm install
cp .env.example .env
npm run db:setup
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), paste your OpenRouter key under **Settings**, then return to **Chat**.

## In-app path (~45 seconds)

| Step | Time | Action |
| --- | --- | --- |
| 1 | 0:00 | On the empty chat screen, click **Run 45s demo**. Atrium grants `demo-workspace/`, enables shell, and opens a thread with the **Launch Demo** agent. |
| 2 | 0:05 | Click **Send** on the pre-filled message (or paste prompt 1 below). Watch the **write_file** chip — a file appears under `demo-workspace/hello-atrium.txt`. |
| 3 | 0:25 | Send prompt 2 below. A **run_shell** chip appears with **Approve** / **Deny**. Click **Approve** to list the demo folder (`dir` on Windows, `ls -la` on macOS/Linux). |
| 4 | 0:45 | Done — you saw file write + shell approval on your local Atrium install. |

### Prompt 1 — write_file

After setup, the textarea is pre-filled. It asks the agent to call `write_file` on:

`{your-clone}/demo-workspace/hello-atrium.txt`

### Prompt 2 — shell approve

The in-app banner auto-fills a cross-platform prompt after step 1. On Windows it uses `dir`; elsewhere `ls -la`.

## Demo setup security

| Endpoint | Mutates settings? | Who can call |
| --- | --- | --- |
| `GET /api/demo/setup` | **No** — read-only metadata | Anyone who can reach the host |
| `POST /api/demo/setup` | **Yes** — grants `demo-workspace/` + enables shell | Same-origin browser session with operator cookie, **localhost only** by default |

`npm run dev` binds to localhost. If you expose Atrium on another host, set `ATRIUM_DEMO_SETUP=1` in `.env` **only for local dev** — otherwise POST stays blocked off localhost.

## API-only setup (optional)

Read prompts without mutating:

```bash
curl -s http://localhost:3000/api/demo/setup | jq
```

Bootstrap (requires operator session — use the in-app button instead of curl):

```bash
# Prefer the in-app "Run 45s demo" button; it sends the operator cookie automatically.
```

## What this does *not* do

- No login, no hosted demo service, no local model download — OpenRouter only.
- Demo grants only the repo’s `demo-workspace/` folder and turns shell on in your local SQLite settings row.

## Troubleshooting

| Issue | Fix |
| --- | --- |
| Amber “Add OpenRouter key” banner | Paste key in Settings |
| Agent refuses to write | Use the **Launch Demo** agent and the exact demo prompts |
| No Approve chip | Ensure shell is enabled (demo setup turns it on) and you sent prompt 2 |
| `Launch Demo` agent missing | Run `npm run db:seed` |
| Demo setup returns 403 | Open the app at `http://localhost:3000` (not a LAN IP) or set `ATRIUM_DEMO_SETUP=1` for dev |

See also [plugins/README.md](../plugins/README.md) for extending Atrium with drop-in plugins.
