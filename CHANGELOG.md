# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Phase 2 tool loop: SSE streaming chat (`token` / `tool` / `done` / `error`), structured tool log chips on assistant messages.
- Allowlisted `run_shell` with Settings toggle (“Allow shell in granted folders”), hard-reject for dangerous commands, and Approve/Deny for mutating commands (`POST /api/tools/approve`).
- Allowlisted `write_file` and `edit_file` tools (text files, 256KB cap, unique-match edit).

### Changed

- Local-first: no login / password gate. `/` redirects to `/chat`. OpenRouter-only (no local-model download).
- Windows allowlist matching is case-insensitive.
- Public open-source polish: README, license, contributing guides, CI, and brand assets.

### Removed

- Studio password auth / JWT session / Sign out.

## [0.1.0] - 2026-09-12

### Added

- Studio password auth with jose JWT session cookie.
- Settings singleton in SQLite for OpenRouter API key (masked after save) and path allowlist.
- Custom agents with name, description (system prompt), and per-agent OpenRouter model selection.
- Chat completions via `https://openrouter.ai/api/v1` using each agent's `modelId`, with `HTTP-Referer` and `X-Title: Atrium`.
- Path allowlist tools: `list_dir` and `read_file` (absolute paths only; empty allowlist = not granted).
- Seeded demo agents Mara Chen, Theo Rios, and Imani Brooks (ordinary, deletable rows).
- Stack: Next.js 16 App Router, React 19, Tailwind v4, Prisma + SQLite, TypeScript.

[Unreleased]: https://github.com/kyawzawhein-qa/atrium/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/kyawzawhein-qa/atrium/releases/tag/v0.1.0
