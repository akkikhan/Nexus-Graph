# QA Matrix

This matrix turns the current Nexus web flow into repeatable checks.

These checks are written from the perspective of a real user of the local app at:

- `http://localhost:3000`
- `http://localhost:3001`

## Test Scope

Covered:

- sidebar routes
- PR inbox and detail flow
- stack create and stack detail flow
- merge queue controls
- activity and insights reads
- AI Rules persistence
- Settings save flow
- API bad-path and edge-path handling

Not covered here:

- production auth/login
- external marketplace packaging workflows
- cloud deployment validation

## Inbox

Happy path:

- `/inbox` returns `200`
- PR list renders
- search narrows results
- status filters switch views
- clicking a PR card opens detail

Bad path:

- PR fetch failure shows `Error loading PRs`

Edge cases:

- empty search result
- unknown `status` query falls back to `all`
- critical-risk PRs render with visible risk state

Observed status:

- pass

## PR Detail

Happy path:

- `/inbox/<id>` returns `200` for an existing PR
- PR title, description, branch info, risk score render
- linked issues render when available
- changed files render when available
- `Request AI Review` succeeds

Bad path:

- `/inbox/does-not-exist` shows `Error loading PR`

Edge cases:

- no linked issues -> explicit empty state
- no changed files -> explicit empty state
- merged PR -> merge button disabled or merged state shown

Observed status:

- pass

## Stacks

Happy path:

- `/stacks` returns `200`
- `New Stack` opens create form
- valid stack create routes to `/stacks/<id>`

Bad path:

- empty stack name shows `Stack name is required.`
- create failure surfaces user-visible error text

Edge cases:

- repository left blank
- non-default base branch
- empty stack list shows empty state

Observed status:

- pass

## Stack Detail

Happy path:

- `/stacks/<id>` returns `200` for an existing stack
- branch order renders
- `Sync Stack` succeeds
- `Submit Stack` succeeds

Bad path:

- invalid or deleted stack id shows `Error loading stack`

Edge cases:

- branch without linked PR
- stack with mixed PR statuses
- stack with no linked issues

Observed status:

- pass

## Queue

Happy path:

- `/queue` returns `200`
- queue summary cards render
- `Pause Queue` works
- `Resume Queue` works
- turbo toggle works

Bad path:

- queue fetch failure shows error text

Edge cases:

- empty active queue shows empty state
- retry and remove buttons disable while pending

Observed status:

- pass

## Activity

Happy path:

- `/activity` returns `200`
- activity feed renders
- filter switching works
- load-more flow is available

Bad path:

- unsupported activity filter returns `400` from API

Edge cases:

- filter with no matching events
- mixed event categories

Observed status:

- pass

## Insights

Happy path:

- `/insights` returns `200`
- dashboard sections render

Bad path:

- data fetch failure shows error text

Edge cases:

- low-data periods
- unusually high metrics

Observed status:

- pass

## AI Rules

Happy path:

- `/ai-rules` returns `200`
- saved settings load on page open
- provider/model/toggle/threshold changes can be saved
- values persist after reload

Bad path:

- load failure shows user-visible message
- save failure shows user-visible message

Edge cases:

- threshold at `0`
- threshold at `100`
- reset without save only changes local state until persisted

Observed status:

- pass

## Settings

Happy path:

- `/settings` returns `200`
- saved settings load
- `Save Changes` succeeds
- health and integration sections render

Bad path:

- invalid settings payload returns `400`
- duplicate integration connection returns `409`
- unsupported integration provider returns `400`

Edge cases:

- no integration connections
- disabled integration connections
- acknowledged/muted/unmuted alert state transitions
- empty retry queues
- escalation cooldown behavior

Observed status:

- pass

## API Contract Checks

Validated endpoints include:

- `/health`
- `/api/v1/prs`
- `/api/v1/stacks`
- `/api/v1/queue`
- `/api/v1/activity`
- `/api/v1/insights/*`
- `/api/v1/reviews/*`
- `/api/v1/settings`
- `/api/v1/chat/*`
- `/api/v1/agents/*`
- `/api/v1/integrations/*`

Observed status:

- pass

## Release Checks

Known passing local checks:

- `pnpm validate:release`
- `node scripts/validation/api-smoke.mjs`
- `node scripts/validation/web-e2e-smoke.mjs`

## Recommended Manual Regression Run

Use this sequence for a fast manual pass:

1. Open `/inbox`
2. Open one PR
3. Request AI review
4. Open `/stacks`
5. Submit empty stack form and verify validation
6. Create a valid stack
7. Open stack detail
8. Sync stack
9. Submit stack
10. Open `/queue`
11. Pause queue
12. Resume queue
13. Toggle turbo
14. Open `/activity`
15. Open `/insights`
16. Open `/ai-rules`
17. Change one value and save
18. Reload `/ai-rules` and verify persistence
19. Open `/settings`
20. Save current settings once

## Open Cleanup Items

- stale compiled `.js` artifacts still exist in some source folders and can make text searches look misleading
- demo seed data still exists for deterministic local bootstrap

These are cleanup concerns, not blockers for the tested local app flow above.
