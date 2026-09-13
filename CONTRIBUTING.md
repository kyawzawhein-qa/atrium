# Contributing to Atrium

Thanks for helping improve Atrium. This guide keeps contributions focused, reviewable, and safe.

## Local setup

```bash
npm install
cp .env.example .env
npm run db:setup
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in with the studio password (`atrium` by default).

**Do not put an OpenRouter API key in `.env`.** Paste it in the app under Settings. It is stored in the local SQLite `Settings` row.

### Useful scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Local development server |
| `npm run lint` | ESLint |
| `npm run build` | Production build |
| `npm run db:setup` | Generate Prisma client, push schema, seed |

## Branch and pull requests

1. Fork the repository (or create a branch if you have write access).
2. Create a focused branch from `main`, e.g. `feat/path-allowlist-ux` or `fix/session-cookie`.
3. Keep changes scoped to one concern.
4. Run `npm run lint` and `npm run build` before opening a PR.
5. Open a pull request against `main` using the PR template.
6. Describe what changed, why, and how you verified it.

## Code style

- **TypeScript** throughout (`src/`). Prefer explicit types at API boundaries.
- Match existing patterns: App Router routes, Prisma access via `src/lib/prisma.ts`, shared helpers under `src/lib/`.
- Auth gate lives in `src/proxy.ts` (Next.js 16). Do not reintroduce `middleware.ts` unless the framework requirement changes.
- Keep UI copy calm and professional. English only in project files.
- Prefer small, readable components over large monoliths.

## Secrets and safety

- Never commit `.env`, `*.db`, API keys, or session secrets.
- Never log or print the OpenRouter key.
- Path tools (`list_dir`, `read_file`) must stay allowlist-bound; do not weaken path checks.
- Do not commit `node_modules` or `.next`.

## Issues

- Use GitHub Issues for bugs and feature ideas.
- Security reports belong in [GitHub Security Advisories](https://github.com/kyawzawhein-qa/atrium/security/advisories/new) — see [SECURITY.md](SECURITY.md).

## License

By contributing, you agree that your contributions are licensed under the MIT License.
