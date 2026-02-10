# NEXUS Self-Hosted Deployment

Complete Docker deployment for NEXUS code review platform.

## Quick Start

```bash
# 1. Copy environment template
cp .env.example .env

# 2. Edit .env with your settings
# - Set POSTGRES_PASSWORD
# - Set AUTH_SECRET
# - Add GitHub App credentials
# - Add at least one AI provider key

# 3. Start the platform
docker compose up -d

# 4. Access NEXUS
# Web: http://localhost:3000
# API: http://localhost:3001
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
