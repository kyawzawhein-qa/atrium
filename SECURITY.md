# Security Policy

## Supported versions

| Version | Supported |
| --- | --- |
| 0.1.x | Yes |

## Reporting a vulnerability

Please report security issues **privately** via [GitHub Security Advisories](https://github.com/kyawzawhein-qa/atrium/security/advisories/new).

Do not open a public issue for vulnerabilities that could expose credentials or escape the path allowlist / shell gate.

You can expect an acknowledgment when the report is reviewed. Please allow reasonable time for a fix before any public disclosure.

## Operational notes

### API keys

- The OpenRouter API key is stored in the SQLite `Settings` singleton after you paste it in the app.
- It must **never** be placed in `.env` or committed to git.
- After save, the UI shows a masked preview only.

### Local-first access

- Atrium has **no login**. Anyone who can reach the host can use the studio. Bind to localhost or put a reverse-proxy auth in front for shared machines.

### Path allowlist

- Filesystem tools run on the **server machine** hosting Atrium, not in the browser.
- Only absolute paths may be granted. An empty allowlist means tools are not granted.
- Tools include `list_dir`, `read_file`, `write_file`, and `edit_file`, and reject paths outside granted roots (including `..` traversal).
- Grant the minimum paths you need. Do not allowlist system-wide roots unless you fully understand the risk.

### Shell (`run_shell`)

- Off by default (`enableShell`). Requires a non-empty allowlist; cwd must resolve inside a granted folder.
- Dangerous patterns (e.g. `rm -rf /`, `shutdown`, `curl | sh`) are always rejected.
- Mutating commands require operator Approve / Deny (in-memory, 5-minute TTL).

### Database

- SQLite files (`*.db`) are local data and must stay out of version control.
