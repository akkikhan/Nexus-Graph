# =============================================================
# NEXUS Platform - Oracle Cloud Deployment (Windows)
# - Creates remote backup before deployment
# - Auto-rolls back on deployment failure
# =============================================================

param(
    [Parameter(Mandatory = $true)]
    [string]$VmIp,
    [string]$VmUser = "ubuntu",
    [string]$SshKey = "$env:USERPROFILE\.ssh\oci_ed25519",
    [switch]$SkipBuild
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

function Get-LocalSha256([string]$Path) {
    return (Get-FileHash -Algorithm SHA256 $Path).Hash.ToLowerInvariant()
}

function To-Lf([string]$Text) {
    # When sending scripts over SSH, ensure LF newlines so bash doesn't see `\r`.
    return ($Text -replace "`r`n", "`n") -replace "`r", ""
}

function Invoke-RemoteBash([string]$Script, [switch]$KeepAlive) {
    # PowerShell pipelines normalize newlines when writing to native process stdin.
    # Write LF-only bytes to a temp file, then redirect stdin into ssh so bash doesn't see \r.
    $tmp = Join-Path $env:TEMP ("nexus-remote-" + [Guid]::NewGuid().ToString("N") + ".sh")
    try {
        $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
        [System.IO.File]::WriteAllText($tmp, (To-Lf $Script), $utf8NoBom)

        # PowerShell doesn't support `< file` redirection; use `cmd.exe` for stdin redirection.
        $target = "$VmUser@$VmIp"
        if ($KeepAlive) {
            cmd /c "ssh -i ""$SshKey"" -o StrictHostKeyChecking=no -o ServerAliveInterval=30 -o ServerAliveCountMax=8 ""$target"" ""bash -s"" < ""$tmp"""
        } else {
            cmd /c "ssh -i ""$SshKey"" -o StrictHostKeyChecking=no ""$target"" ""bash -s"" < ""$tmp"""
        }

        if ($LASTEXITCODE -ne 0) {
            throw "remote bash script failed with exit code $LASTEXITCODE"
        }
    } finally {
        Remove-Item -Force -ErrorAction SilentlyContinue $tmp
    }
}
function Invoke-Rollback {
    Write-Host "[deploy] attempting rollback to latest backup..." -ForegroundColor Yellow
    $rollbackScript = @'
set -euo pipefail
LATEST_BACKUP="$(ls -1t ~/nexus-backup-*.tar.gz 2>/dev/null | head -n1 || true)"
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
'@

    Invoke-RemoteBash -Script $rollbackScript
}

try {
    if (-not $SkipBuild) {
        Write-Host "[deploy] Note: Docker images build inside the VM (Node 20). Skipping local build." -ForegroundColor DarkGray
    }

    Write-Host "[deploy] Packaging archive..." -ForegroundColor Yellow
    Push-Location $ProjectDir
    git archive --format=tar.gz -o $ArchivePath HEAD
    if ($LASTEXITCODE -ne 0) { throw "git archive failed with exit code $LASTEXITCODE" }
    Pop-Location

    # Verify archive integrity locally before uploading.
    tar -tf $ArchivePath > $null
    if ($LASTEXITCODE -ne 0) { throw "archive integrity check failed with exit code $LASTEXITCODE" }
    $localSha = Get-LocalSha256 $ArchivePath
    $localSize = (Get-Item $ArchivePath).Length
    Write-Host "[deploy] Archive SHA256: $localSha" -ForegroundColor DarkGray
    Write-Host "[deploy] Archive size: $localSize bytes" -ForegroundColor DarkGray

    Write-Host "[deploy] Uploading archive..." -ForegroundColor Yellow
    scp -i $SshKey -o StrictHostKeyChecking=no -o ServerAliveInterval=30 -o ServerAliveCountMax=8 $ArchivePath "${VmUser}@${VmIp}:~/nexus-deploy.tar.gz"
    if ($LASTEXITCODE -ne 0) { throw "scp failed with exit code $LASTEXITCODE" }

    # Verify upload integrity on the VM. If this fails, do not proceed.
    $remoteSha = (ssh -i $SshKey -o StrictHostKeyChecking=no -o ServerAliveInterval=30 -o ServerAliveCountMax=8 "$VmUser@$VmIp" "sha256sum /home/$VmUser/nexus-deploy.tar.gz | cut -d' ' -f1").Trim().ToLowerInvariant()
    if ($LASTEXITCODE -ne 0) { throw "remote sha256 check failed with exit code $LASTEXITCODE" }
    if ($remoteSha -ne $localSha) {
        throw "Upload hash mismatch. local=$localSha remote=$remoteSha"
    }

    Write-Host "[deploy] Running remote deployment..." -ForegroundColor Yellow
    # Send the script via stdin to avoid quote/CRLF issues with remote `bash -c "..."` parsing.
    $remoteScript = @'
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

TS="$(date +%Y%m%d%H%M%S)"
if [ -d ~/nexus ]; then
  tar -czf ~/nexus-backup-${TS}.tar.gz -C ~ nexus
fi

ENV_BAK=""
if [ -f ~/nexus/docker/.env ]; then
  ENV_BAK="/tmp/nexus.env"
  cp ~/nexus/docker/.env "$ENV_BAK"
fi

rm -rf ~/nexus_new
mkdir -p ~/nexus_new
tar -tzf ~/nexus-deploy.tar.gz >/dev/null
tar -xzf ~/nexus-deploy.tar.gz -C ~/nexus_new
rm -f ~/nexus-deploy.tar.gz

if [ -n "$ENV_BAK" ]; then
  mkdir -p ~/nexus_new/docker
  cp "$ENV_BAK" ~/nexus_new/docker/.env
fi

rm -rf ~/nexus
mv ~/nexus_new ~/nexus

cd ~/nexus/docker
if [ ! -f .env ]; then
  cp .env.example .env
fi

# Use production overrides when present (keeps DB/Redis internal, etc).
COMPOSE=(docker compose -f docker-compose.yml)
if [ -f docker-compose.prod.yml ]; then
  COMPOSE+=( -f docker-compose.prod.yml )
fi

# Build sequentially to reduce peak memory/CPU and avoid BuildKit cancel cascades.
"${COMPOSE[@]}" build api
"${COMPOSE[@]}" build web
"${COMPOSE[@]}" up -d

# Wait for services to become reachable (Next.js can take a bit to boot).
for i in $(seq 1 60); do
  if curl -fsS http://localhost:3001/health >/dev/null; then
    break
  fi
  sleep 2
done
curl -fsS http://localhost:3001/health >/dev/null

# Run DB migrations (idempotent) after API is up.
echo "[deploy] running db migrations..."
  # drizzle-kit is installed in packages/db/node_modules (not at repo root)
  docker exec nexus-api sh -lc 'cd /app/packages/db && ./node_modules/.bin/drizzle-kit migrate'

for i in $(seq 1 60); do
  if curl -fsS http://localhost:3000 >/dev/null; then
    break
  fi
  sleep 2
done
curl -fsS http://localhost:3000 >/dev/null
"${COMPOSE[@]}" ps
'@

    Invoke-RemoteBash -Script $remoteScript -KeepAlive
    if ($LASTEXITCODE -ne 0) { throw "remote deployment failed with exit code $LASTEXITCODE" }

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

