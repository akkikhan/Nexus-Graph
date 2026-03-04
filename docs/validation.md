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
- `POST /api/v1/prs` (ephemeral smoke PR create)
- `PATCH /api/v1/prs/:id`
- `GET /api/v1/prs/:id`
- `POST /api/v1/prs/:id/request-review`
- `GET /api/v1/stacks`
- `POST /api/v1/stacks` (ephemeral smoke stack create)
- `POST /api/v1/stacks/:id/branches` (base + child branch)
- `PUT /api/v1/stacks/:id/reorder`
- `POST /api/v1/stacks/:id/sync`
- `POST /api/v1/stacks/:id/submit`
- `GET /api/v1/stacks/:id` (detail)
- `DELETE /api/v1/stacks/:id`
- `GET /api/v1/stacks/:id` -> `404` after delete
- `GET /api/v1/activity?limit=5`
- `GET /api/v1/insights/dashboard`
- `POST /api/v1/insights/predict-conflicts`
- `POST /api/v1/insights/reviewer-fatigue`
- `GET /api/v1/insights/velocity?period=week`
- `GET /api/v1/insights/code-health`
- `GET /api/v1/insights/optimal-reviewers`
- `GET /api/v1/queue`
- `POST /api/v1/queue/pause` + `GET /api/v1/queue` state assertion
- `POST /api/v1/queue/resume`
- `POST /api/v1/queue/turbo` + `GET /api/v1/queue` state assertion
- `POST /api/v1/queue/:id/retry` (when active item exists)
- `DELETE /api/v1/queue/:id` (when active item exists)
- `GET /api/v1/reviews/pr/:prId` (using first PR from list)
- `POST /api/v1/reviews`
- `POST /api/v1/reviews/comment`
- `POST /api/v1/reviews/:id/resolve` (using newly created comment)
- `GET /api/v1/reviews/pending?limit=5`

Degraded-mode behavior:

- `prs`, `stacks`, and `activity` may return `503` when DB is unavailable.
- `insights` endpoints return `503` with `{ error, details }` when DB is unavailable.
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
