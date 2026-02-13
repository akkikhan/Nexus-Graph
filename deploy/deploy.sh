#!/usr/bin/env bash
set -euo pipefail

# =============================================================
# NEXUS Platform - Oracle Cloud Deployment (Linux/macOS)
# - Creates remote backup before deployment
# - Auto-rolls back on deployment failure
# =============================================================

VM_USER="${VM_USER:-ubuntu}"
VM_IP="${VM_IP:?Set VM_IP environment variable (example: VM_IP=1.2.3.4)}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/oci_ed25519}"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REMOTE_DIR="${REMOTE_DIR:-$HOME/nexus}"
ARCHIVE_LOCAL="/tmp/nexus-deploy-$(date +%Y%m%d%H%M%S).tar.gz"
ARCHIVE_REMOTE="~/nexus-deploy.tar.gz"

SSH=(ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$VM_USER@$VM_IP")
SCP=(scp -i "$SSH_KEY" -o StrictHostKeyChecking=no)

log() { echo "[deploy] $*"; }

remote_rollback_latest_backup() {
  "${SSH[@]}" 'bash -s' <<'ROLLBACK'
set -euo pipefail

LATEST_BACKUP="$(ls -1t ~/nexus-backup-*.tar.gz 2>/dev/null | head -n1 || true)"
if [ -z "$LATEST_BACKUP" ]; then
  echo "[rollback] no backup archive found"
  exit 1
fi

echo "[rollback] restoring from $LATEST_BACKUP"
rm -rf ~/nexus
tar -xzf "$LATEST_BACKUP" -C ~
cd ~/nexus/docker
docker compose up -d
sleep 10
curl -fsS http://localhost:3001/health >/dev/null
curl -fsS http://localhost:3000 >/dev/null
echo "[rollback] restore successful"
ROLLBACK
}

if [ ! -f "$SSH_KEY" ]; then
  echo "SSH key not found: $SSH_KEY" >&2
  exit 1
fi

log "Target: $VM_USER@$VM_IP"
log "Project: $PROJECT_DIR"
log "Packaging archive..."
cd "$PROJECT_DIR"
tar --exclude='node_modules' \
    --exclude='.git' \
    --exclude='.turbo' \
    --exclude='.next' \
    --exclude='dist' \
    --exclude='*.tsbuildinfo' \
    --exclude='tests/validation/output' \
    -czf "$ARCHIVE_LOCAL" .

log "Uploading archive..."
"${SCP[@]}" "$ARCHIVE_LOCAL" "$VM_USER@$VM_IP:$ARCHIVE_REMOTE"

DEPLOY_FAILED=0
{
  log "Running remote deployment..."
  "${SSH[@]}" 'bash -s' <<'REMOTE'
set -euo pipefail

if ! command -v docker >/dev/null 2>&1; then
  echo "[remote] installing docker..."
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker "$USER"
  sudo systemctl enable docker
  sudo systemctl start docker
fi

if ! docker compose version >/dev/null 2>&1; then
  sudo apt-get update -y
  sudo apt-get install -y docker-compose-plugin
fi

TS="$(date +%Y%m%d%H%M%S)"
if [ -d ~/nexus ]; then
  BACKUP_FILE="~/nexus-backup-${TS}.tar.gz"
  echo "[remote] creating backup: $BACKUP_FILE"
  tar -czf "$BACKUP_FILE" -C ~ nexus
fi

mkdir -p ~/nexus
tar -xzf ~/nexus-deploy.tar.gz -C ~/nexus
rm -f ~/nexus-deploy.tar.gz

cd ~/nexus/docker
if [ ! -f .env ]; then
  cp .env.example .env
  echo "[remote] created docker/.env from template"
fi

docker compose build --no-cache
docker compose up -d
sleep 15
curl -fsS http://localhost:3001/health >/dev/null
curl -fsS http://localhost:3000 >/dev/null
docker compose ps
echo "[remote] deployment healthy"
REMOTE
} || DEPLOY_FAILED=1

rm -f "$ARCHIVE_LOCAL"

if [ "$DEPLOY_FAILED" -ne 0 ]; then
  log "Deployment failed. Attempting rollback..."
  remote_rollback_latest_backup
  log "Rollback complete."
  exit 1
fi

log "Deployment complete."
log "Web: http://$VM_IP:3000"
log "API: http://$VM_IP:3001/api/v1"
