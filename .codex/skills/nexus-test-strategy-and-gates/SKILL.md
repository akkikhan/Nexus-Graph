---
name: nexus-test-strategy-and-gates
description: Define complete Nexus testing strategy, quality gates, and test matrix across unit, integration, contract, smoke, E2E, performance, security, resilience, and release validation. Use when planning a new phase or deciding what tests are required before merge.
---

# Nexus Test Strategy and Gates

## Overview

Use this skill to define what must be tested, where each test belongs, and which gates block release.

## Workflow

1. Build test inventory.
- Read root scripts in `package.json`.
- Read `docs/validation.md` and existing tests under `tests/validation`.
- Map each feature to current and missing tests.

2. Build test matrix by level.
- Unit: package-level logic and pure functions.
- Integration: DB/repository/service interactions.
- Contract: API response shapes and status behavior.
- Smoke/E2E: user-critical flows across web+api.
- Non-functional: performance, security, resilience.

3. Define quality gates.
- PR gate: fast unit + lint + changed-surface contracts.
- Pre-merge gate: smoke API + smoke web.
- Release gate: `pnpm validate:release`.

4. Define ownership and cadence.
- Mark each test suite as `per-commit`, `nightly`, or `pre-release`.
- Assign owners per domain (web/api/cli/db).

5. Produce executable plan.
- Output missing tests as ordered tasks.
- Tie each task to a command and pass criteria.

## Completion Criteria

Finish when every planned feature has:
- test level assignment,
- gate assignment,
- and pass/fail criteria.