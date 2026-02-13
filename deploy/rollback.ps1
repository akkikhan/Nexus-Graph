param(
    [Parameter(Mandatory = $true)]
    [string]$VmIp,
    [string]$VmUser = "ubuntu",
    [string]$SshKey = "$env:USERPROFILE\.ssh\oci_ed25519"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $SshKey)) {
    throw "SSH key not found: $SshKey"
}

Write-Host "[rollback] Target: $VmUser@$VmIp"

ssh -i $SshKey -o StrictHostKeyChecking=no "$VmUser@$VmIp" @"
set -euo pipefail
LATEST_BACKUP=`$(ls -1t ~/nexus-backup-*.tar.gz 2>/dev/null | head -n1 || true)
if [ -z "`$LATEST_BACKUP" ]; then
  echo "[rollback] no backup archive found"
  exit 1
fi
rm -rf ~/nexus
tar -xzf "`$LATEST_BACKUP" -C ~
cd ~/nexus/docker
docker compose up -d
sleep 10
curl -fsS http://localhost:3001/health >/dev/null
curl -fsS http://localhost:3000 >/dev/null
docker compose ps
echo "[rollback] complete"
"@
