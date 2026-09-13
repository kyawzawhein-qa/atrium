# Security Policy

## Supported versions

| Version | Supported |
| --- | --- |
| 0.1.x | Yes |

## Reporting a vulnerability

Please report security issues **privately** via [GitHub Security Advisories](https://github.com/kyawzawhein-qa/atrium/security/advisories/new).

Do not open a public issue for vulnerabilities that could expose credentials, bypass auth, or escape the path allowlist.

You can expect an acknowledgment when the report is reviewed. Please allow reasonable time for a fix before any public disclosure.

## Operational notes

### API keys

- The OpenRouter API key is stored in the SQLite `Settings` singleton after you paste it in the app.
- It must **never** be placed in `.env` or committed to git.
- After save, the UI shows a masked preview only.

### Studio auth

- Access is gated by `ATRIUM_PASSWORD` and a signed JWT session cookie (`jose`).
- Change `ATRIUM_PASSWORD` and `ATRIUM_SESSION_SECRET` for any non-local deployment.
- Default local password is `atrium` — suitable for demos only.

### Path allowlist

- Filesystem tools run on the **server machine** hosting Atrium, not in the browser.
- Only absolute paths may be granted. An empty allowlist means tools are not granted.
- Phase 1 tools are read-oriented (`list_dir`, `read_file`) and reject paths outside granted roots (including `..` traversal).
- Grant the minimum paths you need. Do not allowlist system-wide roots unless you fully understand the risk.

### Database

- SQLite files (`*.db`) are local data and must stay out of version control.
