# Validation Guide

Validation includes API smoke contracts, browser smoke checks, and release orchestration.

## Local Commands

- `pnpm validate:artifacts`
- `pnpm smoke:api`
- `pnpm smoke:web`
- `pnpm validate:release`
- `pnpm validate:release:ci`
- `pnpm vscode:manifest:test`
- `pnpm vscode:manifest:check`
- `pnpm vscode:release:ci`
- `pnpm menubar:metadata`
- `pnpm menubar:release:ci`

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
- `GET /api/v1/prs/:id/ai-review-jobs/:jobId` (queued/completed state checks)
- `POST /api/v1/prs/:id/ai-review-jobs/:jobId/start`
- `POST /api/v1/prs/:id/ai-review-jobs/:jobId/complete` (findings persistence)
- `POST /api/v1/chat/sessions`
- `GET /api/v1/chat/sessions`
- `POST /api/v1/chat/sessions/:id/messages` (validation + persistence + provenance)
- `GET /api/v1/chat/sessions/:id`
- `GET /api/v1/chat/sessions/:id/messages`
- `POST /api/v1/agents/runs`
- `GET /api/v1/agents/runs`
- `GET /api/v1/agents/runs/:id`
- `POST /api/v1/agents/runs/:id/transition` (lifecycle transition checks + approval checkpoint guardrails)
- `POST /api/v1/agents/runs/:id/audit` (audit append with redaction + budget guardrails)
- `GET /api/v1/agents/runs/:id/audit`
- `POST /api/v1/integrations/connections` (Slack + Linear setup)
- `GET /api/v1/integrations/connections`
- `POST /api/v1/integrations/connections/:id/validate` (manual validation + failure drill)
- `POST /api/v1/integrations/connections/:id/status` (operator enable/disable lifecycle)
- `GET /api/v1/integrations/connection-action-audits` (durable operator action audit feed for connection validation/status changes)
- `POST /api/v1/integrations/issue-links` (Linear/Jira link persistence)
- `GET /api/v1/integrations/issue-links`
- `POST /api/v1/integrations/issue-links/:id/sync` (back-link sync attempt)
- `GET /api/v1/integrations/issue-links/:id/sync-events`
- `POST /api/v1/integrations/issue-links/retry-sync`
- `GET /api/v1/integrations/issue-link-action-audits` (durable operator action audit feed for issue-link sync/retry controls)
- `POST /api/v1/integrations/notifications` (durable notification enqueue)
- `POST /api/v1/integrations/notifications/:id/deliver` (delivery attempt + retry/dead-letter transitions)
- `POST /api/v1/integrations/notifications/retry`
- `GET /api/v1/integrations/notifications/:id`
- `GET /api/v1/integrations/notification-action-audits` (durable operator action audit feed for notification deliver/retry controls)
- `POST /api/v1/integrations/webhooks/provider/:provider` (durable webhook ingestion with idempotency)
- `GET /api/v1/integrations/webhooks`
- `GET /api/v1/integrations/webhook-action-audits` (durable operator action audit feed for webhook process/retry controls)
- `GET /api/v1/integrations/webhook-auth-events` (auth rejection/config-error telemetry listing)
- `GET /api/v1/integrations/webhook-auth-events/export` (server-side JSON/CSV export of filtered auth-event telemetry)
- `POST /api/v1/integrations/webhooks/:id/process`
- `POST /api/v1/integrations/webhooks/retry`
- `POST /api/v1/integrations/slack/actions` (callback ingestion + processing)
- `GET /api/v1/integrations/metrics`
- `GET /api/v1/integrations/alerts`
- `GET /api/v1/stacks`
- `POST /api/v1/stacks` (ephemeral smoke stack create)
- `POST /api/v1/stacks/:id/branches` (base + child branch)
- `PUT /api/v1/stacks/:id/reorder`
- `POST /api/v1/stacks/:id/sync`
- `POST /api/v1/stacks/:id/submit`
- `GET /api/v1/stacks/:id` (detail)
- `DELETE /api/v1/stacks/:id`
- `GET /api/v1/stacks/:id` -> `404` after delete
- `GET /api/v1/activity?limit=50`
- `GET /api/v1/activity?limit=50&type=integration_event` (strict integration-event contract check + excludes local stack snapshot fallback event)
- `GET /api/v1/activity?limit=20&type=ai_review`
- `GET /api/v1/activity?limit=20&type=review_requested`
- `GET /api/v1/activity?limit=20&type=pr_merged`
- `GET /api/v1/activity?limit=20&type=stack_updated` (includes local snapshot fallback event assertion)
- `GET /api/v1/activity?limit=5&type=unsupported_event` -> `400` (invalid filter contract)
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
- Integrations webhook ingestion now includes abuse checks for missing signature and stale timestamps (`401` paths validated in smoke).
- Integrations metrics/alerts now include webhook auth failure telemetry (provider/reason/rate), sample-gated noisy-alert suppression controls (`minDeliverySamples`, `minWebhookAuthSamples`), and threshold-based alert assertions.
- Integrations alerts now support triage workflow coverage: repo-scoped acknowledge/mute/unmute actions, muted alert suppression in `alerts[]` with `mutedAlerts[]`, and per-alert runbook links.
- Integrations observability now includes incident timeline aggregation (`/integrations/incidents/timeline`) and triage audit history filters with actor attribution (`/integrations/alerts/triage-audits`).
- Integrations incident response automation now includes bulk triage (`/integrations/alerts/bulk-triage`) and SLA breach summaries (`/integrations/incidents/sla-summary`) with repo/window/severity thresholds.

## Web Smoke Coverage

`pnpm smoke:web`

Uses Playwright (`tests/validation/smoke.spec.ts`) and validates:

- Inbox healthy flow (search/filter, open detail, request AI review)
- Inbox integration context (Linear/Jira issue-link badges in list and linked-issue panel in PR detail)
- Inbox degraded flow (explicit error UI on mocked `503`)
- Stacks list + open stack detail route
- Stack detail integration context (linked Linear/Jira issue badges per branch PR)
- Queue turbo toggle
- Activity filter switching (Reviews, Merges, Stacks, Integrations) with include/exclude assertions per tab
- Activity integration context (Integrations filter + provider/scope/action/outcome chips)
- Insights dashboard load
- Settings diagnostics panel load (webhook auth events + filter path)
- Settings integrations operations snapshot (connections + metrics + alerts)
- Settings alert triage actions (acknowledge, mute/unmute, runbook links) with persisted server responses
- Settings integrations incident timeline and alert-triage audit feed filters (action/actor/alert-code)
- Settings integrations incident response automation (bulk triage controls + incident SLA summary panel)
- Settings connection control plane actions (validate/fail-validate/enable/disable + persisted action audit feed)
- Settings webhook recovery actions (list/process/fail/retry controls + persisted action audit feed)
- Settings notification delivery actions (list/deliver/fail/retry controls + persisted action audit feed)
- Settings issue-link sync actions (list/sync/fail/retry controls + persisted action audit feed)
- Settings diagnostics export controls (JSON/CSV) render and trigger server-side export requests
- Release `web-e2e-smoke` also fails on unexpected `/api/v1/*` client-error (`4xx`) responses to catch silent contract regressions
- Release `web-e2e-smoke` fails on unexpected browser runtime errors (`pageerror`) and console `error` logs
- Release `web-e2e-smoke` fails on non-aborted network request failures (`requestfailed`) for app/API traffic (ignores expected dev-mode HMR/navigation abort noise)

Prerequisite:

- `pnpm exec playwright install chromium`

## Release Validation

`pnpm validate:release`

What it does:

- Runs menu bar app unit tests (`@nexus/menubar-app`, including Electron tray template/action wiring coverage)
- Includes auto-update client coverage (manifest parsing, channel resolution, sha256 checksum validation, optional Ed25519 signature verification, rollout gating, authenticated download + local checksum verification, download cancel/retry + installer handoff tray actions, availability states, and persisted snooze/skip decision logic)
- Runs VS Code extension unit tests (`nexus-vscode-extension`)
- Runs VS Code manifest contract tests (`scripts/release/vscode-manifest-validation.test.mjs`) and strict manifest checks before smoke orchestration
- Starts API and Web services
- Waits for readiness checks
- Runs API smoke
- Runs web smoke script with `REQUIRE_PLAYWRIGHT=true` (fails if Playwright is missing)
- Stops services

`pnpm validate:release:ci` uses the same orchestration and is intended for CI pipelines.

## CI Workflow

Workflow file: `.github/workflows/validation.yml`

Jobs:

- `api-smoke`
- `web-smoke`
- `release-validation` (depends on both)
- `vscode-extension-package` (depends on `release-validation`, builds VSIX artifact and enforces manifest checks)
- `menubar-package` (depends on `release-validation`, builds Electron distribution artifacts and generates release-channel auto-update metadata)

Failure artifacts uploaded:

- `output/ci-logs/`
- `output/playwright/`
- `output/playwright-report/`
- `output/vscode-extension/` (VS Code `.vsix` artifact + package logs)
- `output/menubar/` (Electron package artifacts + `updates/latest-*.json` metadata manifests)

## Environment Variables

- `API_BASE_URL` (default `http://localhost:3001`)
- `WEB_BASE_URL` (default `http://localhost:3000`)
- `ALLOW_DEGRADED` (`true` by default)
- `REQUIRE_PLAYWRIGHT` (`false` by default, set `true` in CI)
- `RELEASE_API_PORT` (default `3101`, used by `validate:release` API service)
- `RELEASE_WEB_PORT` (default `3000`, readiness + web smoke target for `validate:release`)
