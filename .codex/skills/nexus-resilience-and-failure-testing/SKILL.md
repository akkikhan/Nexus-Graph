---
name: nexus-resilience-and-failure-testing
description: Test Nexus behavior during dependency outages, restarts, retries, and partial failures to ensure durable state and graceful degradation. Use when hardening queue, jobs, integrations, and critical workflows.
---

# Nexus Resilience and Failure Testing

## Overview

Use this skill to validate that workflows remain correct during real-world failures.

## Workflow

1. Define failure scenarios.
- DB unavailable.
- Redis/queue backend unavailable.
- SCM provider API outage.
- Process restart mid-workflow.

2. Run failure drills.
- Trigger failure during active queue/review jobs.
- Verify retries and idempotency behavior.
- Verify no duplicate side effects.

3. Validate degraded-mode UX/API.
- Ensure explicit degraded responses where intended.
- Ensure UI communicates recovery path.

4. Validate recovery.
- Restore dependency and verify workflow resumes.
- Confirm persisted state continuity.

## Completion Criteria

Finish when each critical workflow has tested behavior for:
- failure,
- degraded operation,
- and recovery.