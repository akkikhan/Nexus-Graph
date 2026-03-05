---
name: nexus-db-migration-and-data-testing
description: Validate Nexus database migrations, schema changes, and seed/backfill safety across local and hosted Postgres targets. Use when changing packages/db schema, migrations, or repository persistence behavior.
---

# Nexus DB Migration and Data Testing

## Overview

Use this skill to prevent data loss and schema drift while evolving persistent workflows.

## Workflow

1. Validate environment assumptions.
- Run DB env checks before migration.
- Confirm target URL and SSL requirements for hosted DBs.

2. Validate migration behavior.
- Run migrate on clean DB.
- Re-run migrate to confirm idempotent steady state.
- Verify rollback strategy exists for risky changes.

3. Validate seed and backfill safety.
- Ensure seed scripts are deterministic.
- For backfills, measure runtime and lock impact.
- Verify partial-failure restart behavior.

4. Validate app compatibility.
- Start API and run smoke after migration.
- Verify key read/write routes on migrated schema.

## Command Baseline

- `pnpm db:env:preflight`
- `pnpm --filter @nexus/db db:migrate`
- `pnpm --filter @nexus/db db:seed`
- `pnpm smoke:api`

## Completion Criteria

Finish when migration changes are validated for:
- clean apply,
- repeat apply,
- data compatibility,
- and post-migration smoke pass.