---
name: nexus-cli-and-git-workflow-testing
description: Test Nexus CLI commands and git workflow behavior for stack creation, submission, sync, navigation, and auth paths. Use when changing apps/cli commands or stack/git utility logic.
---

# Nexus CLI and Git Workflow Testing

## Overview

Use this skill to validate command behavior, side effects, and failure handling for local developer workflows.

## Workflow

1. Define command behavior to verify.
- Inputs/options.
- Git side effects (branch creation, checkout, push, rebase).
- Stack metadata changes (`.nexus/*`).

2. Add unit tests for command logic.
- Mock git/provider clients for fast deterministic checks.
- Verify command output and exit behavior.

3. Add integration tests for git workflows.
- Use temporary repos.
- Cover create -> submit -> sync -> cleanup paths.
- Cover conflict and invalid state paths.

4. Verify auth and config behavior.
- Token validation and storage rules.
- Misconfiguration and missing repo handling.

## Command Baseline

- `pnpm --filter @nexus/cli test`
- `pnpm test`

## Completion Criteria

Finish when every changed CLI command has:
- success-path test,
- invalid-input test,
- and failure-path test for git/provider errors.