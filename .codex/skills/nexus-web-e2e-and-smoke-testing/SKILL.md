---
name: nexus-web-e2e-and-smoke-testing
description: Build and maintain Nexus web smoke and E2E tests for critical dashboard flows using Playwright. Use when changing inbox, stack, queue, activity, insights, or settings UX.
---

# Nexus Web E2E and Smoke Testing

## Overview

Use this skill to protect user-critical workflows against UI regressions with deterministic Playwright tests.

## Workflow

1. Identify user-critical flow.
- Inbox list -> detail -> action.
- Stack list -> detail -> sync/submit.
- Queue controls.
- Activity filters.
- Insights load.

2. Add or update Playwright coverage.
- Keep tests in `tests/validation/smoke.spec.ts` for release-critical paths.
- Mock network responses only when testing UI behavior in isolation.
- Prefer stable selectors (`data-testid`, role, visible text).

3. Validate degraded UX.
- Add explicit tests for backend `503`/error rendering.
- Ensure actionable error copy and recovery path exist.

4. Keep execution reliable.
- Avoid flaky waits; use URL and role assertions.
- Keep smoke runtime lean for CI.

## Command Baseline

- `pnpm smoke:web`
- `pnpm validate:web-smoke`
- `pnpm exec playwright install chromium`

## Completion Criteria

Finish when changed UI flow has:
- healthy path coverage,
- degraded path coverage,
- and deterministic assertions suitable for CI.