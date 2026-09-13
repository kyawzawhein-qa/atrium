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
| 3 | 0:25 | Send prompt 2 below. A **run_shell** chip appears with **Approve** / **Deny**. Click **Approve** to run `ls -la` in the demo folder. |
| 4 | 0:45 | Done — you saw file write + shell approval on your local Atrium install. |

### Prompt 1 — write_file

After setup, the textarea is pre-filled. It asks the agent to call `write_file` on:

`{your-clone}/demo-workspace/hello-atrium.txt`

### Prompt 2 — shell approve

```
Run the shell command ls -la in {your-clone}/demo-workspace using run_shell. Wait for my approval before assuming it ran.
```

Replace `{your-clone}` with the absolute path shown in the demo banner (the setup API returns it).

## API-only setup (optional)

```bash
curl -s -X POST http://localhost:3000/api/demo/setup | jq
```

Returns `demoPath`, `agentId`, and both prompts. Create a thread with `agentId`, then send the prompts in chat.

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

See also [plugins/README.md](../plugins/README.md) for extending Atrium with drop-in plugins.
