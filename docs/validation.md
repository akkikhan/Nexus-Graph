# Validation Guide

Validation includes API smoke contracts, browser smoke checks, and release orchestration.

## Local Commands

- `pnpm validate:artifacts`
- `pnpm smoke:api`
- `pnpm smoke:web`
- `pnpm validate:release`
- `pnpm validate:release:ci`

Compatibility aliases:

- `pnpm validate:api-smoke`
- `pnpm validate:web-smoke`

## Artifact Preflight

`pnpm validate:artifacts`

Checks `apps/web/src/app/**` for forbidden generated route artifacts:

- `page.js`
- `page.js.map`
- `page.d.ts`
- `page.d.ts.map`

If any are present, the command fails and prints full paths.

## API Smoke Coverage

`pnpm smoke:api`

Checks:

- `GET /health`
- `POST /api/v1/stacks/sync-local` (setup)
- `GET /api/v1/prs?limit=5`
- `GET /api/v1/stacks`
- `GET /api/v1/activity?limit=5`
- `GET /api/v1/insights/dashboard`
- `GET /api/v1/queue`

Degraded-mode behavior:

- `prs`, `stacks`, and `activity` may return `503` when DB is unavailable.
- Degraded `503` is accepted when payload includes an `error` field.
- Set `ALLOW_DEGRADED=false` to require strict `200` responses.

## Web Smoke Coverage

`pnpm smoke:web`

Uses Playwright (`tests/validation/smoke.spec.ts`) and validates:

- Inbox healthy flow (search/filter, open detail, request AI review)
- Inbox degraded flow (explicit error UI on mocked `503`)
- Stacks list + open stack detail route
- Queue turbo toggle
- Activity filter switching
- Insights dashboard load

Prerequisite:

- `pnpm exec playwright install chromium`

## Release Validation

`pnpm validate:release`

What it does:

- Starts API and Web services
- Waits for readiness checks
- Runs API smoke
- Runs web smoke script
- Stops services

`pnpm validate:release:ci` uses the same orchestration and is intended for CI pipelines.

## CI Workflow

Workflow file: `.github/workflows/validation.yml`

Jobs:

- `api-smoke`
- `web-smoke`
- `release-validation` (depends on both)

Failure artifacts uploaded:

- `output/ci-logs/`
- `output/playwright/`
- `output/playwright-report/`

## Environment Variables

- `API_BASE_URL` (default `http://localhost:3001`)
- `WEB_BASE_URL` (default `http://localhost:3000`)
- `ALLOW_DEGRADED` (`true` by default)
- `REQUIRE_PLAYWRIGHT` (`false` by default, set `true` in CI)
