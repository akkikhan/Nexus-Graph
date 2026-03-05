---
name: nexus-persistence-hardening
description: Replace Nexus in-memory and mock behavior with durable database-backed workflows, background jobs, and failure-safe state transitions. Use when implementing Phase 1 reliability work for queue, review, stack, and insights pipelines.
---

# Nexus Persistence Hardening

## Overview

Use this skill to convert mock or ephemeral backend behavior into durable, restart-safe production workflows.

## Workflow

1. Locate non-durable behavior.
- Run `rg -n "mock|in-memory|TODO|In production|placeholder" apps/api/src apps/web/src`.
- Prioritize endpoints used by Inbox, PR detail, Stacks, Queue, and Insights.

2. Define persistence model changes.
- Add or evolve tables for queue state, review threads/comments, stack operations, and insight events.
- Add audit columns (`createdAt`, `updatedAt`, actor, source).
- Define idempotency keys for externally triggered operations.

3. Replace mock handlers with repositories.
- Route handlers must call repository/service layers only.
- Avoid in-route mutable globals for workflow state.
- Return typed errors and stable HTTP status codes.

4. Add asynchronous job processing.
- Queue long-running actions (AI review, queue processing, webhook fan-out).
- Make jobs idempotent and retry-safe.
- Persist job status and expose observability fields.

5. Validate operational behavior.
- Verify state survives API restart.
- Verify retry and failure behavior.
- Verify consistency across UI refresh and concurrent actions.

## Guardrails

- Do not ship new route features on mock data.
- Do not mutate critical workflow state without transactional boundaries.
- Do not merge if restart loses queue/review/stack state.

## Completion Criteria

Finish when:
- Queue, reviews, stack operations, and insights events are DB-backed.
- Restart and retry tests pass.
- Health endpoints report real dependency status.
