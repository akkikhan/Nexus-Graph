---
name: nexus-merge-queue-integration
description: Build a real SCM-integrated merge queue for Nexus with policy enforcement, status checks, retries, and stack awareness. Use when implementing Phase 3 merge queue parity against GitHub-style workflows.
---

# Nexus Merge Queue Integration

## Overview

Use this skill to replace mock queue behavior with a production queue that integrates with provider checks and deterministic merge policies.

## Workflow

1. Define queue domain and policies.
- Specify queue item lifecycle states.
- Define required checks, merge method, retry limits, and conflict policy.
- Define stack-aware ordering rules.

2. Integrate SCM provider APIs.
- Fetch PR status checks and mergeability.
- Execute merge according to configured method.
- Store provider operation IDs for audit and retries.

3. Implement queue worker.
- Process queue head serially with lock protection.
- Re-evaluate eligibility on each tick or webhook event.
- Handle flaky check retries and terminal failures.

4. Implement controls and observability.
- Support pause/resume/turbo only when backed by worker behavior.
- Persist throughput, wait time, and failure metrics.
- Expose queue diagnostics in API and logs.

5. Validate end-to-end behavior.
- Validate enqueue -> checks pass -> merge -> dequeue flow.
- Validate failure and retry behavior.
- Validate stack dependency ordering.

## Guardrails

- Do not use in-process arrays as source of truth.
- Do not merge without explicit policy evaluation.
- Do not hide provider API failures.

## Completion Criteria

Finish when:
- Queue processes real PRs with provider checks.
- Policy and retry behavior is test-covered.
- Queue state and metrics are durable and queryable.
