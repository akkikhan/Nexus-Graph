---
name: nexus-ai-chat-and-agents
description: Implement production AI review lifecycle, contextual chat, and guarded agent workflows in Nexus. Use when building Phase 4 and Phase 5 capabilities for AI reviews, collaborative chat, and prompt-to-PR agent runs.
---

# Nexus AI Chat and Agents

## Overview

Use this skill to deliver reliable AI-assisted workflows that are auditable, controllable, and integrated with real review state.

## Workflow

1. Stabilize AI review lifecycle.
- Treat AI review as a job with persisted request, result, and status.
- Persist findings with severity, location, and rationale.
- Link findings to PR timeline and review actions.

2. Build contextual chat.
- Add chat session model scoped to PR/stack/repo context.
- Attach code snippets, diffs, and prior review findings.
- Persist prompt, response, citations, and tool actions.

3. Build agent execution workflow.
- Implement run states: planned, running, awaiting-approval, completed, failed.
- Require human checkpoints for risky operations.
- Record all file edits and commands in run audit trail.

4. Add safety and governance.
- Enforce provider routing and budget guardrails.
- Redact secrets from model context.
- Block unsafe autonomous actions by policy.

5. Validate with acceptance scenarios.
- Trigger AI review from PR page and verify durable results.
- Continue chat across refresh and new sessions.
- Start agent run, approve checkpoint, and produce traceable PR output.

## Guardrails

- Do not return AI output without provenance metadata.
- Do not run agent mutation steps without explicit approval checkpoints.
- Do not store raw secrets in chat or run logs.

## Completion Criteria

Finish when:
- AI review, chat, and agent runs are durable and auditable.
- Safety constraints are enforced in code paths, not only UI.
- Acceptance scenarios pass for review, chat, and agent flows.
