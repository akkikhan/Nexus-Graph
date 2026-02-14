# NEXUS Self-Hosted Deployment

Complete Docker deployment for NEXUS code review platform.

## Quick Start

```bash
# 1. Copy environment template
cp .env.example .env

# 2. Edit .env with your settings
# - Set POSTGRES_PASSWORD
# - Set AUTH_SECRET
# - Set WEB_URL (and optionally WEB_PORT=80 for cloud)
# - Add GitHub App credentials
# - Add at least one AI provider key

# 3. Start the platform
docker compose up -d

# 4. Access NEXUS
# Web: http://localhost:3000
# API: http://localhost:3001
```

## Database Modes

NEXUS supports three DB configurations:

- Local Postgres (default Docker mode): uses compose `postgres` container
- Supabase hosted Postgres: set `SUPABASE_DATABASE_URL` with `sslmode=require`
- Azure Database for PostgreSQL: set `AZURE_POSTGRES_URL` with `sslmode=require`

Bootstrap commands (run from repository root):

```bash
pnpm db:env:preflight
pnpm db:bootstrap:supabase
pnpm db:bootstrap:azure
```

## Services

| Service    | Port | Description                |
|------------|------|----------------------------|
| web        | 3000 | Web dashboard              |
| api        | 3001 | API server                 |
| postgres   | 5432 | PostgreSQL database        |
| redis      | 6379 | Cache & job queue          |

## Requirements

- Docker 24+
- Docker Compose 2.20+
- 4GB RAM minimum
- 20GB disk space

## GitHub App Setup

1. Go to https://github.com/settings/apps
2. Create a new GitHub App with:
   - Homepage URL: Your NEXUS URL
   - Webhook URL: `{API_URL}/webhooks/github`
   - Permissions:
     - Repository: Contents (Read), Pull requests (Read & Write)
     - Organization: Members (Read)
   - Events: Pull request, Push, Pull request review

## Production Deployment

For production with SSL:

```bash
# Start with nginx profile
docker compose --profile production up -d
```

Configure `nginx.conf` with your SSL certificates.

### Recommended Production Networking

`docker-compose.yml` publishes Postgres (`5432`) and Redis (`6379`) to the host to make local development easy.

For production, keep them internal to the Docker network:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

For direct VM exposure without nginx:

- Set `WEB_URL` to your public URL (for example, `http://<vm-public-ip>:3000`)
- Set `CORS_ORIGINS` to the same origin
- Optional: set `WEB_PORT=80` to serve the web app on standard HTTP port

## Deployment Rollback

The repo includes VM-level deployment helpers with automatic backup/rollback:

- `deploy/deploy.sh` and `deploy/deploy.ps1` (creates `~/nexus-backup-<timestamp>.tar.gz` before deploy)
- `deploy/rollback.sh` and `deploy/rollback.ps1` (restores latest backup)

## Upgrading

```bash
# Pull latest images
docker compose pull

# Restart services
docker compose up -d

# Run migrations (if needed)
docker compose exec api pnpm db:migrate
```

## Backup

```bash
# Backup database
docker compose exec postgres pg_dump -U nexus nexus > backup.sql

# Restore database
cat backup.sql | docker compose exec -T postgres psql -U nexus nexus
```
