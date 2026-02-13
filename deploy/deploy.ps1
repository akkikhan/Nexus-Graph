# =============================================================
# NEXUS Platform - Oracle Cloud Deployment (Windows)
# - Creates remote backup before deployment
# - Auto-rolls back on deployment failure
# =============================================================

param(
    [Parameter(Mandatory = $true)]
    [string]$VmIp,
    [string]$VmUser = "ubuntu",
    [string]$SshKey = "$env:USERPROFILE\.ssh\oci_ed25519"
)

$ErrorActionPreference = "Stop"
$ProjectDir = Split-Path -Parent $PSScriptRoot
$ArchivePath = Join-Path $env:TEMP "nexus-deploy-$([DateTime]::UtcNow.ToString('yyyyMMddHHmmss')).tar.gz"

Write-Host "[deploy] Target: $VmUser@$VmIp"
Write-Host "[deploy] Key: $SshKey"
Write-Host "[deploy] Project: $ProjectDir"

if (-not (Test-Path $SshKey)) {
    throw "SSH key not found: $SshKey"
}

function Invoke-Rollback {
    Write-Host "[deploy] attempting rollback to latest backup..." -ForegroundColor Yellow
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
echo "[rollback] restore successful"
"@
}

try {
    Write-Host "[deploy] Packaging archive..." -ForegroundColor Yellow
    Push-Location $ProjectDir
    tar --exclude='node_modules' `
        --exclude='.git' `
        --exclude='.turbo' `
        --exclude='.next' `
        --exclude='dist' `
        --exclude='*.tsbuildinfo' `
        --exclude='tests/validation/output' `
        -czf $ArchivePath .
    Pop-Location

    Write-Host "[deploy] Uploading archive..." -ForegroundColor Yellow
    scp -i $SshKey -o StrictHostKeyChecking=no $ArchivePath "${VmUser}@${VmIp}:~/nexus-deploy.tar.gz"

    Write-Host "[deploy] Running remote deployment..." -ForegroundColor Yellow
    ssh -i $SshKey -o StrictHostKeyChecking=no "$VmUser@$VmIp" @"
set -euo pipefail

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker \$USER
  sudo systemctl enable docker
  sudo systemctl start docker
fi

if ! docker compose version >/dev/null 2>&1; then
  sudo apt-get update -y
  sudo apt-get install -y docker-compose-plugin
fi

TS=`$(date +%Y%m%d%H%M%S)
if [ -d ~/nexus ]; then
  tar -czf ~/nexus-backup-`$TS.tar.gz -C ~ nexus
fi

mkdir -p ~/nexus
tar -xzf ~/nexus-deploy.tar.gz -C ~/nexus
rm -f ~/nexus-deploy.tar.gz

cd ~/nexus/docker
if [ ! -f .env ]; then
  cp .env.example .env
fi

docker compose build --no-cache
docker compose up -d
sleep 15
curl -fsS http://localhost:3001/health >/dev/null
curl -fsS http://localhost:3000 >/dev/null
docker compose ps
"@

    Write-Host "[deploy] Deployment complete." -ForegroundColor Green
    Write-Host "[deploy] Web: http://${VmIp}:3000" -ForegroundColor Green
    Write-Host "[deploy] API: http://${VmIp}:3001/api/v1" -ForegroundColor Green
}
catch {
    Write-Host "[deploy] Deployment failed: $($_.Exception.Message)" -ForegroundColor Red
    try {
        Invoke-Rollback
    }
    catch {
        Write-Host "[deploy] Rollback failed: $($_.Exception.Message)" -ForegroundColor Red
    }
    throw
}
finally {
    if (Test-Path $ArchivePath) {
        Remove-Item $ArchivePath -ErrorAction SilentlyContinue
    }
}
