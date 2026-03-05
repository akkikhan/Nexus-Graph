---
name: nexus-scope-and-contracts
description: Define and lock Nexus product parity scope, API contracts, data models, and acceptance criteria before implementation. Use when planning a new phase, converting roadmap items into sprint-ready tasks, or resolving ambiguity about what to build first.
---

# Nexus Scope and Contracts

## Overview

Use this skill to convert parity goals into an executable implementation scope with clear contracts and testable acceptance criteria.

## Workflow

1. Confirm target parity and non-goals.
- Read the latest parity baseline in `docs/analysis/graphite-vs-nexus-gap-plan-2026-03-04.md`.
- Split goals into `must-have`, `should-have`, and `out-of-scope`.

2. Inventory current behavior before proposing changes.
- Enumerate existing web surfaces under `apps/web/src/app/(dashboard)`.
- Enumerate API routes under `apps/api/src/routes`.
- Flag mock or placeholder behavior explicitly.

3. Freeze contracts before coding.
- Define entity contracts for: PR, Review, Stack, QueueItem, InsightEvent, Notification, IntegrationConnection.
- Define request and response schemas for every endpoint affected in the phase.
- Define backward compatibility rules per endpoint.

4. Produce a phase spec.
- Include: objective, user stories, API deltas, DB deltas, background jobs, UI deltas, and rollout plan.
- Map every story to one acceptance test.

5. Build sprint-ready backlog.
- Break work into PR-sized tasks with ownership, dependencies, and risk notes.
- Order tasks to deliver a vertical slice early.

## Output Format

Always output:
1. Scope table (`must-have`, `should-have`, `out-of-scope`)
2. Contract changes (API + DB)
3. Task breakdown (ordered)
4. Acceptance checklist
5. Risks and mitigations

## Completion Criteria

Finish when:
- Every planned change has a contract and acceptance test.
- Ambiguous requirements are reduced to explicit assumptions.
- Task ordering is implementation-ready without additional planning passes.
