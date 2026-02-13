#!/usr/bin/env bash
set -euo pipefail

VM_USER="${VM_USER:-ubuntu}"
VM_IP="${VM_IP:?Set VM_IP environment variable (example: VM_IP=1.2.3.4)}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/oci_ed25519}"

SSH=(ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$VM_USER@$VM_IP")

echo "[rollback] Target: $VM_USER@$VM_IP"

"${SSH[@]}" 'bash -s' <<'REMOTE'
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
docker compose ps
echo "[rollback] complete"
REMOTE
