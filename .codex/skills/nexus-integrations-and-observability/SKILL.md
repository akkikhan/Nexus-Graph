---
name: nexus-integrations-and-observability
description: Implement production-grade external integrations and operational observability for Nexus, including Slack, Linear/Jira linkage, notifications, metrics, and alerting. Use when executing Phase 6 ecosystem and reliability work.
---

# Nexus Integrations and Observability

## Overview

Use this skill to connect Nexus workflows with external systems while making system behavior measurable and operable.

## Workflow

1. Design integration contract.
- Define a common connector interface for auth, sync, and webhook handling.
- Store connection metadata and token references per org/project.
- Version webhook event schema and processing outcomes.

2. Implement priority integrations.
- Slack: notification delivery and action callbacks.
- Linear/Jira: link PR and stack states to issue lifecycle.
- SCM webhook ingestion: normalize and persist incoming events.

3. Build notification pipeline.
- Add event-to-notification routing rules.
- Support retry, dead-letter, and delivery status tracking.
- Expose per-channel success and failure metrics.

4. Build observability baseline.
- Add structured logs and correlation IDs.
- Add metrics for API latency, queue throughput, job retries, and integration failures.
- Define alerts for SLO breaches and stuck workflows.

5. Validate operational readiness.
- Run failure drills for webhook outage and provider throttling.
- Verify dashboards and alerts reflect real incident conditions.
- Verify support/debug paths from UI to logs and event traces.

## Guardrails

- Do not couple product logic directly to provider-specific SDK calls.
- Do not deliver notifications without durable event records.
- Do not ship integrations without retry and failure visibility.

## Completion Criteria

Finish when:
- Core integrations are configurable and durable.
- Notification and webhook pipelines are observable and retry-safe.
- On-call diagnostics can trace workflow failures end-to-end.
