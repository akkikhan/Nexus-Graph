---
name: nexus-phase-orchestrator
description: Orchestrate Nexus delivery by auto-selecting the right project skills based on phase and task intent. Use when the user asks to proceed with implementation, planning, testing, or hardening without naming specific skills, and when clear sequencing across multiple skills is needed.
---

# Nexus Phase Orchestrator

## Overview

Use this skill as the default coordinator for Nexus work. Detect intent, select the minimum required sub-skills, execute in order, and report assumptions/blockers explicitly.

Read references before execution:
- `references/phase-skill-map.md`
- `references/honesty-checklist.md`

## Routing Workflow

1. Detect intent from the request.
- Map request to phase and work type (planning, implementation, testing, hardening).

2. Select sub-skills from the phase map.
- Use the smallest set that covers the task.
- Announce selected skills and order in one short line before major work.

3. Enforce testing gates for every implementation.
- Include the relevant testing skill for changed surfaces.
- Run command gates defined by test skills.

4. Enforce honesty protocol on every update.
- State assumptions and confidence when uncertain.
- State blockers immediately.
- Never claim completion without verification evidence.

5. Handle tooling and MCP explicitly.
- If a workflow depends on MCP/external tooling and it is not configured, state this as a blocker and continue with the best fallback path.

## Selection Rules

- Phase 0 (scope/contracts): use `nexus-scope-and-contracts` + `nexus-test-strategy-and-gates`.
- Phase 1 (persistence): use `nexus-persistence-hardening` + `nexus-api-contract-and-integration-testing` + `nexus-db-migration-and-data-testing` + `nexus-resilience-and-failure-testing` + `nexus-release-validation-and-ci-testing`.
- Phase 2 (review parity): use `nexus-review-workflow-parity` + `nexus-web-e2e-and-smoke-testing` + `nexus-api-contract-and-integration-testing` + `nexus-release-validation-and-ci-testing`.
- Phase 3 (merge queue): use `nexus-merge-queue-integration` + `nexus-api-contract-and-integration-testing` + `nexus-resilience-and-failure-testing` + `nexus-performance-and-load-testing` + `nexus-release-validation-and-ci-testing`.
- Phase 4/5 (AI, chat, agents): use `nexus-ai-chat-and-agents` + `nexus-api-contract-and-integration-testing` + `nexus-web-e2e-and-smoke-testing` + `nexus-security-and-abuse-testing` + `nexus-performance-and-load-testing` + `nexus-resilience-and-failure-testing` + `nexus-release-validation-and-ci-testing`.
- Phase 6 (integrations/ops): use `nexus-integrations-and-observability` + `nexus-api-contract-and-integration-testing` + `nexus-security-and-abuse-testing` + `nexus-resilience-and-failure-testing` + `nexus-performance-and-load-testing` + `nexus-release-validation-and-ci-testing`.

## Required Output Pattern

For each substantial task, output in this order:
1. Selected skills and order
2. Assumptions and unknowns
3. Planned steps
4. Verification commands and results
5. Remaining risks and next step

## Completion Criteria

Finish only when:
- selected skills were actually applied,
- required tests for touched surfaces were run or explicitly blocked,
- and uncertainty/blockers were clearly disclosed.