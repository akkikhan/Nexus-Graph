---
name: nexus-performance-and-load-testing
description: Define and run Nexus performance and load tests for API latency, queue throughput, and UI responsiveness under realistic traffic. Use when introducing heavier workflows or before scaling and release hardening.
---

# Nexus Performance and Load Testing

## Overview

Use this skill to set measurable performance budgets and verify the system meets them under load.

## Workflow

1. Define SLO-aligned budgets.
- API p50/p95 latency targets.
- Queue throughput targets.
- Critical page interaction targets.

2. Select load scenarios.
- PR listing/filtering bursts.
- Queue processing bursts.
- AI review job spikes.
- Concurrent dashboard users.

3. Run load tests and profile bottlenecks.
- Capture DB/query, job, and API hotspots.
- Measure error rate under pressure.

4. Add regression guardrails.
- Store baseline numbers.
- Fail pre-release when regressions exceed threshold.

## Completion Criteria

Finish when:
- budgets are documented,
- load scenarios are scripted,
- and regressions can be automatically detected.