# Graphite vs Nexus Gap Analysis and Implementation Plan

Date: 2026-03-04  
Scope: Product parity analysis using Graphite sitemap/docs and current Nexus codebase.

## 1) Graphite sitemap snapshot

Source sitemap index:
- https://graphite.com/sitemap.xml
- https://graphite.com/sitemap-0.xml

Total URLs discovered: 271

Category counts:
- Features: 5
- Docs: 96
- Pricing: 1
- Customers: 10
- Blog: 100
- Research: 15
- Guides: 35
- Use cases: 3
- Other: 6

Primary product capability pages discovered:
- https://graphite.com/features
- https://graphite.com/features/agents
- https://graphite.com/features/ai-reviews
- https://graphite.com/features/chat
- https://graphite.com/features/pr-page
- https://graphite.com/docs/key-features
- https://graphite.com/docs/integrations
- https://graphite.com/docs/insights
- https://graphite.com/docs/graphite-merge-queue

## 2) Graphite feature baseline (from docs/features pages)

Core areas:
- Stacked PR workflow + CLI
- Customizable PR inbox
- Modern PR page
- AI reviews
- Graphite Chat
- Agents
- Insights
- Merge Queue
- Sync tooling
- Notifications
- Integrations (VS Code extension, menu bar app, Slack, Linear, Jira)

## 3) Nexus current capability snapshot

Evidence in repo:
- Web routes: inbox, inbox detail, stacks, stack detail, queue, activity, insights, settings.
- API routes: auth, prs, stacks, reviews, ai, insights, queue, webhooks, activity.
- CLI commands: create, submit, sync, log, navigate, checkout, review, risk, split, auth, init.

Observed gaps in implementation quality:
- Several APIs are mock/in-memory or best-effort placeholders (`queue`, parts of `insights`, `review`, stack ops).
- Settings are localStorage-backed, not persisted per user/org.
- Missing dashboard route for sidebar item `AI Rules`.
- Limited end-to-end integration between UI actions and AI/review lifecycle.
- No implemented Graphite-style Chat/Agent experiences.
- No implemented VS Code extension, menu bar app, Slack/Linear/Jira integrations.

## 4) Gap matrix (Graphite capability vs Nexus)

1. Stacked PRs + CLI:
- Nexus: Partial
- Notes: CLI exists and can create/submit/sync stacks; web/API parity is incomplete for persistent multi-user workflows.

2. PR Inbox:
- Nexus: Partial
- Notes: Basic search/status filtering exists; no advanced customization/rules, no reviewer productivity workflows.

3. PR Page:
- Nexus: Partial
- Notes: Detail page exists, but rich review workflows, deep diff interactions, and action-card style operations are limited.

4. AI Reviews:
- Nexus: Partial
- Notes: AI endpoints exist; UI-triggered “request review” is lightweight and not fully integrated with persisted threaded comments lifecycle.

5. Chat:
- Nexus: Missing
- Notes: No chat route/UI/API conversation model for review collaboration.

6. Agents:
- Nexus: Missing
- Notes: No workflow for prompt -> branch/PR generation with handoff loop.

7. Merge Queue:
- Nexus: Partial
- Notes: Queue UX exists; backend state is in-memory mock and not integrated with Git provider checks/merge APIs.

8. Insights:
- Nexus: Partial
- Notes: Insights screens/routes exist, but substantial metrics are mocked and not tied to real org/repo telemetry pipelines.

9. Notifications:
- Nexus: Partial/Missing
- Notes: UI toggles exist; no robust notification delivery system (email/Slack/in-app realtime) wired end-to-end.

10. Integrations:
- Nexus: Missing/Partial
- Notes: Settings mention integrations, but real connectors and sync jobs are not complete.

11. VS Code extension:
- Nexus: Missing

12. Menu bar app:
- Nexus: Missing

## 5) Implementation plan (phased)

## Phase 0: Product and architecture baseline (must-do before feature build)
- Define parity target: “Graphite MVP parity” (not full docs/blog parity).
- Freeze data contracts for: PR, review, stack, queue, insight events, chat sessions.
- Standardize auth/session and multi-tenant org/repo model.
- Exit criteria:
  - API schemas versioned and documented.
  - Single source of truth for provider credentials and permissions.

## Phase 1: Core reliability and persistence
- Replace in-memory/mock paths with persistent DB flows for:
  - Queue
  - Review threads/comments
  - Stack submit/sync operations
  - Insights raw events
- Add background job workers (queue processor, webhook ingestion, AI jobs).
- Exit criteria:
  - Server restarts do not lose queue/review state.
  - Web actions reflect durable backend state.

## Phase 2: Graphite parity - review workflow
- Build parity-first PR Inbox upgrades:
  - Saved filters, assignee/repo filters, risk and status facets.
  - Inbox customization preferences stored server-side.
- Upgrade PR page:
  - Unified review actions, comments timeline, actionable cards (merge/rebase/request-review/fix suggestions).
- Exit criteria:
  - Reviewer can process PR end-to-end from inbox + PR page.

## Phase 3: Merge Queue parity
- Integrate queue with GitHub checks and merge APIs.
- Support queue policies:
  - Required checks
  - Retry strategy
  - Merge method options
  - Stack-aware dependencies
- Exit criteria:
  - Real PRs can enter queue and auto-merge based on policy.

## Phase 4: AI parity (AI reviews + Chat)
- Wire AI review lifecycle:
  - Trigger, persist findings, severity routing, human feedback loop.
- Build Chat module:
  - Contextual chat on PR/stack with code search and diff context.
  - Suggested edits and quick-fix handoff.
- Exit criteria:
  - AI review + chat are production-usable with traceable outputs.

## Phase 5: Agent workflow
- Implement agent runs:
  - Prompt -> plan -> code changes -> PR draft
  - Human approval checkpoints
  - Iteration loop from review comments
- Exit criteria:
  - Agent can create a safe draft PR workflow with audit trail.

## Phase 6: Integrations and ecosystem
- Build real integrations:
  - Slack notifications
  - Linear/Jira link sync
  - Webhook management UI
- Define VS Code extension MVP:
  - Inbox summary, PR actions, AI review trigger.
- Exit criteria:
  - Integrations are configurable per org and observable.

## 6) Recommended first implementation batch (next sprint)

Priority order:
1. Persistence foundation (Phase 1) for queue/review/stack state.
2. PR Inbox + PR Page parity upgrades (Phase 2).
3. Real Merge Queue provider integration (Phase 3).

Why:
- Highest user-visible value with smallest platform risk.
- Prevents building Chat/Agents on unstable mock workflows.

## 7) Risks and mitigation

1. Risk: Building AI/Agents too early on mock workflows.
- Mitigation: Complete Phase 1 before Phase 4/5.

2. Risk: Provider API coupling (GitHub-only assumptions).
- Mitigation: Adapter abstraction for SCM provider interfaces.

3. Risk: Metrics trust issues from synthetic insights.
- Mitigation: Event pipeline + provenance markers (“computed from live data”).

4. Risk: Scope blow-up.
- Mitigation: Strict parity definition and milestone acceptance tests.

## 8) Success metrics for parity program

- Time-to-first-review action from inbox.
- Median PR cycle time.
- Merge queue throughput and failure rate.
- AI finding acceptance rate.
- % of stacks managed end-to-end without manual recovery.

