---
name: nexus-security-and-abuse-testing
description: Plan and execute security and abuse-path testing for Nexus auth, API validation, secrets handling, webhook integrity, and agent/AI guardrails. Use for high-risk backend or auth changes.
---

# Nexus Security and Abuse Testing

## Overview

Use this skill to verify security controls in code paths, not only configuration docs.

## Workflow

1. Enumerate attack surfaces.
- Auth/token handling.
- Webhooks/signature validation.
- Input validation and injection surfaces.
- Secrets and model-context leakage paths.

2. Execute abuse-path tests.
- Invalid/expired token flows.
- Privilege escalation attempts.
- Replay/tamper webhook payloads.
- Oversized payload and rate-limit abuse.

3. Verify safe failure behavior.
- Ensure errors do not leak sensitive internals.
- Ensure denied actions are auditable.

4. Add regression security tests.
- Add focused checks for every fixed vulnerability class.

## Completion Criteria

Finish when changed security-relevant paths have:
- negative tests,
- safe failure assertions,
- and audit visibility.