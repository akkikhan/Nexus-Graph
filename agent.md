# Agent Notes

## Project Overview
NEXUS is a pnpm/turborepo monorepo with workspaces in `apps/*` and `packages/*`.

## Prerequisites
- Node.js >= 20
- pnpm 9.x (`package.json` declares 9.15.0)

## Common Commands
- Install: `pnpm install`
- Dev: `pnpm dev`
- Build: `pnpm build`
- Test: `pnpm test`
- Lint: `pnpm lint`
- Format: `pnpm format`
- Clean: `pnpm clean`

## Environment
- Copy `.env.example` to `.env` and fill required values.

## Repo Layout
- `apps/`: app entry points
- `packages/`: shared packages and libraries
- `docs/`: documentation and assets

## Notes
- Dev runs via Turbo (`turbo dev`) and may start multiple apps in parallel.
- Use pnpm workspace commands for package-specific tasks when needed.