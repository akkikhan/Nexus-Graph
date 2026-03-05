---
name: nexus-release-validation-and-ci-testing
description: Run and extend Nexus release validation and CI test orchestration, including artifact checks, API smoke, web smoke, and full release validation. Use before releases and when changing validation pipelines.
---

# Nexus Release Validation and CI Testing

## Overview

Use this skill to keep release gates reliable, fast enough, and representative of production-critical behavior.

## Workflow

1. Validate local release pipeline.
- Confirm services boot and readiness checks pass.
- Confirm API smoke and web smoke pass through orchestrator.

2. Validate CI workflow parity.
- Ensure local commands map to CI jobs.
- Ensure failure artifacts are preserved for debugging.

3. Harden gate semantics.
- Decide strict vs degraded mode (`ALLOW_DEGRADED`).
- Enforce strict mode for release-critical environments.

4. Keep pipelines actionable.
- Keep logs concise with clear failure location.
- Avoid hidden retries that mask instability.

## Command Baseline

- `pnpm validate:artifacts`
- `pnpm smoke:api`
- `pnpm smoke:web`
- `pnpm validate:release`
- `pnpm validate:release:ci`

## Completion Criteria

Finish when release path can be executed deterministically and provides fast root-cause signals on failure.