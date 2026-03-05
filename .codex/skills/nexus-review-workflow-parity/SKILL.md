---
name: nexus-review-workflow-parity
description: Implement Graphite-like review workflow parity in Nexus inbox and PR page, including filtering, actionability, and end-to-end review lifecycle integration. Use when building Phase 2 reviewer experience improvements.
---

# Nexus Review Workflow Parity

## Overview

Use this skill to deliver a complete reviewer flow: discover PRs quickly, act from inbox, and complete review on the PR page without dead ends.

## Workflow

1. Stabilize data contracts first.
- Confirm list and detail payloads for PR, comments, review status, risk summary, and queue state.
- Ensure API responses include fields needed by UI without ad-hoc fetch chains.

2. Upgrade inbox behavior.
- Add robust filters (status, repo, author, risk).
- Add saved views/preferences per user.
- Add quick actions (request AI review, assign, merge readiness hints).

3. Upgrade PR page behavior.
- Show review timeline, status transitions, and actionable cards.
- Support deterministic action states (pending/success/failure) for merge/review actions.
- Surface risk rationale, not only risk score.

4. Wire backend lifecycle.
- Persist review events and comment threads.
- Ensure UI actions map to durable backend transitions.
- Emit activity events for major review actions.

5. Add tests.
- Add API contract tests for `/prs` and `/reviews` paths.
- Add web E2E coverage for inbox filters, open PR detail, request review, and merge action state.

## UX Constraints

- Keep primary reviewer actions reachable in one click from inbox or PR page.
- Prefer explicit action-state feedback over silent failures.
- Keep loading and error states localized and recoverable.

## Completion Criteria

Finish when:
- Reviewer can process PRs end-to-end from inbox to completed review.
- Key actions survive page refresh and server restart.
- E2E review workflow tests pass.
