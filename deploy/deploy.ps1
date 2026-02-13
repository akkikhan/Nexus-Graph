# =============================================================
# NEXUS Platform - Oracle Cloud Deployment (Windows)
# PowerShell helper to deploy Nexus to an Oracle Free Tier VM
# =============================================================

param(
    [Parameter(Mandatory = $true)]
    [string]$VmIp,
    [string]$VmUser = "ubuntu",
    [string]$SshKey = "$env:USERPROFILE\.ssh\oci_ed25519"
)

$ErrorActionPreference = "Stop"
$ProjectDir = Split-Path -Parent $PSScriptRoot
$ArchivePath = Join-Path $env:TEMP "nexus-deploy.tar.gz"

Write-Host ""
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host "NEXUS Platform - Oracle Deployment (Windows)" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host "Target: $VmUser@$VmIp"
Write-Host "SSH key: $SshKey"
Write-Host "Project: $ProjectDir"
Write-Host ""

if (-not (Test-Path $SshKey)) {
    Write-Host "SSH key not found at $SshKey" -ForegroundColor Red
    Write-Host "Generate and register an SSH key, then re-run." -ForegroundColor Yellow
    exit 1
}

Write-Host "[1/5] Ensuring Docker exists on VM..." -ForegroundColor Yellow
ssh -i $SshKey -o StrictHostKeyChecking=no "$VmUser@$VmIp" @"
if ! command -v docker >/dev/null 2>&1; then
  echo 'Installing Docker...'
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker \$USER
  sudo systemctl enable docker
  sudo systemctl start docker
else
  echo "Docker already installed: \$(docker --version)"
fi
if ! docker compose version >/dev/null 2>&1; then
  sudo apt-get update -y
  sudo apt-get install -y docker-compose-plugin
fi
"@

Write-Host "[2/5] Packaging project..." -ForegroundColor Yellow
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

Write-Host "[3/5] Uploading archive..." -ForegroundColor Yellow
scp -i $SshKey -o StrictHostKeyChecking=no $ArchivePath "${VmUser}@${VmIp}:~/nexus-deploy.tar.gz"

Write-Host "[4/5] Deploying compose stack..." -ForegroundColor Yellow
ssh -i $SshKey -o StrictHostKeyChecking=no "$VmUser@$VmIp" @"
set -e
mkdir -p ~/nexus
cd ~/nexus
tar -xzf ~/nexus-deploy.tar.gz
rm ~/nexus-deploy.tar.gz
cd docker
if [ ! -f .env ]; then
  cp .env.example .env
fi
docker compose build --no-cache
docker compose up -d
sleep 10
docker compose ps
"@

Write-Host "[5/5] Verifying services..." -ForegroundColor Yellow
ssh -i $SshKey -o StrictHostKeyChecking=no "$VmUser@$VmIp" @"
set -e
curl -fsS http://localhost:3001/health >/dev/null && echo 'API healthy'
curl -fsS http://localhost:3000 >/dev/null && echo 'Web healthy'
"@

Write-Host ""
Write-Host "Deployment completed." -ForegroundColor Green
Write-Host "Web: http://${VmIp}:3000" -ForegroundColor Green
Write-Host "API: http://${VmIp}:3001/api/v1" -ForegroundColor Green

if (Test-Path $ArchivePath) {
    Remove-Item $ArchivePath -ErrorAction SilentlyContinue
}
