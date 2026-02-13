# Database Environments

This project supports local Postgres, Supabase, and Azure Postgres.

## URL Precedence

At runtime and in bootstrap tooling, DB URLs are resolved in this order:

1. `SUPABASE_DATABASE_URL`
2. `DATABASE_URL`
3. `AZURE_POSTGRES_URL`
4. Local fallback: `postgresql://postgres:postgres@localhost:5432/nexus` (API runtime only)

## SSL Requirements

Hosted DB URLs must include an SSL mode:

- `sslmode=require`
- `sslmode=verify-ca`
- `sslmode=verify-full`

The API client also enforces SSL automatically for hosted hosts.

## Commands

```bash
pnpm db:env:preflight
pnpm db:bootstrap:supabase
pnpm db:bootstrap:azure
```

Optional Azure seeding:

```bash
pnpm db:bootstrap:azure -- --seed
```

## Supabase Setup

1. Set `SUPABASE_DATABASE_URL` to your connection string.
2. Ensure URL includes `sslmode=require`.
3. Run:

```bash
pnpm db:bootstrap:supabase
pnpm --filter @nexus/api dev
curl http://localhost:3001/health
```

## Azure Setup

1. Set `AZURE_POSTGRES_URL` to your Azure Postgres connection string.
2. Ensure URL includes `sslmode=require`.
3. Run:

```bash
pnpm db:bootstrap:azure
pnpm --filter @nexus/api dev
curl http://localhost:3001/health
```

## Cutover Checklist (Supabase -> Azure)

1. Set `AZURE_POSTGRES_URL`.
2. Unset `SUPABASE_DATABASE_URL`.
3. If needed, set `DATABASE_URL` to Azure URL for generic tools.
4. Run `pnpm db:bootstrap:azure`.
5. Start API and validate `/health`, `/api/v1/prs`, `/api/v1/stacks`, `/api/v1/activity`.
