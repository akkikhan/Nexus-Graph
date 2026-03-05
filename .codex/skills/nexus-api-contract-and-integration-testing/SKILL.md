---
name: nexus-api-contract-and-integration-testing
description: Design and implement API contract and integration tests for Nexus routes, including success, degraded, and error-path behavior. Use when changing or adding endpoints in apps/api.
---

# Nexus API Contract and Integration Testing

## Overview

Use this skill to keep API behavior stable and verifiable as backend logic moves from mock to persistent workflows.

## Workflow

1. Identify changed routes.
- Scan `apps/api/src/routes` for touched handlers.
- Enumerate request schema, response schema, and expected status codes.

2. Define contract tests.
- Validate shape and required fields for `200` responses.
- Validate degraded behavior (`503`) where allowed by design.
- Validate deterministic error payload shape (`error`, optional `details`).

3. Define integration tests.
- Validate repository and DB interactions with real or test DB.
- Cover transactional boundaries for write paths.
- Include idempotency and retry-sensitive endpoints.

4. Keep smoke compatibility.
- Ensure `scripts/validation/api-smoke.mjs` scenarios still pass.
- Update smoke script only when contract intentionally changes.

## Command Baseline

- `pnpm smoke:api`
- `pnpm validate:api-smoke`
- `pnpm --filter @nexus/api dev`

## Completion Criteria

Finish when changed endpoints have contract coverage for:
- happy path,
- degraded path,
- and error path,
and smoke validation remains green.