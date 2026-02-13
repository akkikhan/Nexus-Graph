# NEXUS Jira Backlog (Graphite Parity)

## Scope
This backlog translates the parity plan into Jira-ready epics and stories.
It is ordered for incremental delivery from foundation to advanced features.

## Labels
- `area:api`
- `area:web`
- `area:cli`
- `area:ai`
- `area:queue`
- `area:integrations`
- `area:realtime`
- `type:epic`
- `type:story`
- `priority:p0`
- `priority:p1`
- `priority:p2`

## Epic E1: Core PR Data Platform
Goal: Replace mocked dashboard data with DB/event-backed API responses.

### Story E1-S1: PR list endpoint uses repository layer
- Priority: `p0`
- Labels: `area:api`, `type:story`
- Description: Wire `GET /api/v1/prs` to `prRepository.list` with query filters.
- Acceptance criteria:
1. Endpoint returns DB records when data exists.
2. Supports `status`, `author`, `repo`, `limit`, `offset`.
3. Returns stable shape consumed by web inbox.
4. Mock data path removed from production code path.

### Story E1-S2: Stacks endpoint uses repository and local-dev fallback
- Priority: `p0`
- Labels: `area:api`, `type:story`
- Description: Wire `GET /api/v1/stacks` and `GET /api/v1/stacks/:id` to repository with local fallback for dev.
- Acceptance criteria:
1. DB-backed response when `userId` query provided and DB reachable.
2. Local fallback from `.nexus/stack.json` for local-first development.
3. Response shape is stable for stacks UI.

### Story E1-S3: Activity endpoint backed by persisted events
- Priority: `p1`
- Labels: `area:api`, `type:story`
- Description: Replace static activity list with event-derived entries.
- Acceptance criteria:
1. Activity items are generated from stored webhook and system events.
2. Supports pagination.
3. Includes event types used by current UI.

## Epic E2: Stacked PR Workflow
Goal: End-to-end stack lifecycle across CLI, API, and web.

### Story E2-S1: Persist stack metadata server-side
- Priority: `p0`
- Labels: `area:api`, `area:cli`, `type:story`
- Description: Add API endpoint(s) so CLI can sync local stack state to backend.
- Acceptance criteria:
1. CLI can push current stack graph to API.
2. API stores stack + branch order + PR linkage.
3. Web stacks page reflects latest synced stack.

### Story E2-S2: Stack submit roundtrip
- Priority: `p1`
- Labels: `area:cli`, `area:api`, `type:story`
- Description: `nx submit` updates branch->PR mapping in backend after create/update.
- Acceptance criteria:
1. PR numbers/URLs stored server-side after submit.
2. Subsequent web loads show these PR links.
3. Failures are retriable and logged.

## Epic E3: Review Inbox and PR Review UX
Goal: Production-grade daily review workflow.

### Story E3-S1: Inbox filters and sections
- Priority: `p1`
- Labels: `area:web`, `area:api`, `type:story`
- Description: Add backend-supported filters and UI controls for inbox triage.
- Acceptance criteria:
1. Filter state encoded in URL.
2. API queries filtered data.
3. Loading/error/empty states handled.

### Story E3-S2: PR detail and review actions
- Priority: `p1`
- Labels: `area:web`, `area:api`, `type:story`
- Description: Add PR detail screen with comments and review actions.
- Acceptance criteria:
1. User can approve/request changes/comment.
2. Inline comments persist and re-load.
3. API validates request payloads.

## Epic E4: Merge Queue
Goal: Stack-aware merge automation with safe retries.

### Story E4-S1: Queue worker foundation
- Priority: `p0`
- Labels: `area:queue`, `area:api`, `type:story`
- Description: Add BullMQ queue + worker for merge lifecycle states.
- Acceptance criteria:
1. Queue entries persist in DB.
2. Worker transitions states (`pending`, `running`, `passed`, `failed`, `merged`).
3. Retries and timeout rules configurable.

### Story E4-S2: Queue UI backed by API
- Priority: `p1`
- Labels: `area:web`, `area:queue`, `type:story`
- Description: Replace mock queue dashboard with live queue API data.
- Acceptance criteria:
1. Active queue and recent outcomes load from API.
2. Pause/resume/retry actions function.
3. Status updates reflected without full page refresh.

### Story E4-S3: Queue optimization mode v1
- Priority: `p2`
- Labels: `area:queue`, `type:story`
- Description: Add basic fast-forward optimization strategy.
- Acceptance criteria:
1. Fast-forward mode is configurable per repo.
2. Merge latency improves in benchmark fixtures.

## Epic E5: AI Review Lifecycle
Goal: Move from optional endpoints to integrated AI review operations.

### Story E5-S1: Auto-trigger AI review on PR open/sync
- Priority: `p1`
- Labels: `area:ai`, `area:api`, `type:story`
- Description: Webhook events enqueue AI review jobs.
- Acceptance criteria:
1. PR open/sync enqueues job.
2. Job status visible in API.
3. Failures captured with retry metadata.

### Story E5-S2: Persist AI findings
- Priority: `p1`
- Labels: `area:ai`, `area:api`, `type:story`
- Description: Save AI summary/risk/comments into PR/review tables.
- Acceptance criteria:
1. AI summary and risk score stored on PR.
2. AI comments stored as review/comment records.
3. Web inbox and activity use persisted AI data.

### Story E5-S3: AI rules and exclusions
- Priority: `p2`
- Labels: `area:ai`, `area:web`, `type:story`
- Description: Build UI/API for rule prompts and file pattern exclusions.
- Acceptance criteria:
1. Org/repo rules can be created/edited/deleted.
2. Rule engine applies during AI review requests.
3. Effective rule set visible per PR.

## Epic E6: Real-time Updates
Goal: Push event-driven state changes to dashboard clients.

### Story E6-S1: Event broadcast integration
- Priority: `p1`
- Labels: `area:realtime`, `area:api`, `type:story`
- Description: Emit websocket events from webhook, queue, and review handlers.
- Acceptance criteria:
1. PR, stack, queue, and AI events are broadcast on relevant channels.
2. Health endpoint shows active connection stats.

### Story E6-S2: Web socket client and subscriptions
- Priority: `p1`
- Labels: `area:web`, `area:realtime`, `type:story`
- Description: Add websocket client in web app and update React Query caches on events.
- Acceptance criteria:
1. Inbox/activity/queue update without manual refresh.
2. Reconnect behavior works after connection drops.

## Epic E7: Integrations and Enterprise Foundations
Goal: Team-level adoption features.

### Story E7-S1: Slack notifications
- Priority: `p2`
- Labels: `area:integrations`, `type:story`
- Description: Send review, queue, and AI-risk notifications to Slack.
- Acceptance criteria:
1. Configurable channel mapping.
2. Delivery retries and error logging.

### Story E7-S2: Linear/Jira linking
- Priority: `p2`
- Labels: `area:integrations`, `area:web`, `type:story`
- Description: Link PRs to work items and surface status context in UI.
- Acceptance criteria:
1. PR links show linked issue keys and titles.
2. Back-linking is visible in issue system.

### Story E7-S3: Audit and RBAC baseline
- Priority: `p1`
- Labels: `area:api`, `type:story`
- Description: Add role checks and auditable action logs for admin-sensitive actions.
- Acceptance criteria:
1. Role-based authorization on queue/config routes.
2. Audit records emitted for admin actions.

## Sprint Plan (suggested)

### Sprint 1
1. E1-S2
2. E1-S1
3. E3-S1 (basic filters only)

### Sprint 2
1. E2-S1
2. E2-S2
3. E4-S1

### Sprint 3
1. E4-S2
2. E6-S1
3. E6-S2

### Sprint 4
1. E5-S1
2. E5-S2
3. E3-S2

### Sprint 5
1. E5-S3
2. E7-S3
3. E7-S1

### Sprint 6
1. E4-S3
2. E7-S2

## Definition of Done (global)
1. Story has API contract and sample request/response in description.
2. Story has unit/integration tests for changed behavior.
3. Story has telemetry/logging for failure paths.
4. Story has docs or runbook updates if operational behavior changed.
