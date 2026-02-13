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

Write-Host ""
Write-Host "╔═══════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║       NEXUS Platform - Oracle Deployment      ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
Write-Host "→ Target: $VmUser@$VmIp"
Write-Host "→ Key:    $SshKey"
Write-Host "→ Source: $ProjectDir"
Write-Host ""

# Verify SSH key exists
if (-not (Test-Path $SshKey)) {
    Write-Host "SSH key not found at $SshKey" -ForegroundColor Red
    Write-Host "Generating SSH key pair..." -ForegroundColor Yellow
    ssh-keygen -t rsa -b 4096 -f $SshKey -N '""' -q
    Write-Host "SSH key generated. Add this public key to your Oracle VM:" -ForegroundColor Green
    Get-Content "$SshKey.pub"
    Write-Host ""
    Write-Host "After adding the key, re-run this script." -ForegroundColor Yellow
    exit 1
}

$SshCmd = "ssh -i `"$SshKey`" -o StrictHostKeyChecking=no $VmUser@$VmIp"
$ScpCmd = "scp -i `"$SshKey`" -o StrictHostKeyChecking=no"

# Step 1: Install Docker on VM
Write-Host "━━━ Step 1: Installing Docker ━━━" -ForegroundColor Yellow
ssh -i $SshKey -o StrictHostKeyChecking=no "$VmUser@$VmIp" @"
if ! command -v docker &> /dev/null; then
    echo 'Installing Docker...'
    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker `$USER
    sudo systemctl enable docker
    sudo systemctl start docker
else
    echo "Docker already installed: `$(docker --version)"
fi
"@

# Step 2: Create archive and upload
Write-Host ""
Write-Host "━━━ Step 2: Packaging project ━━━" -ForegroundColor Yellow
$ArchivePath = Join-Path $env:TEMP "nexus-deploy.tar.gz"

# Use tar (available in modern Windows 10+)
Push-Location $ProjectDir
tar --exclude='node_modules' `
    --exclude='.git' `
    --exclude='.turbo' `
    --exclude='.next' `
    --exclude='dist' `
    --exclude='*.tsbuildinfo' `
    -czf $ArchivePath .
Pop-Location

Write-Host "Archive created: $ArchivePath"

# Step 3: Upload
Write-Host ""
Write-Host "━━━ Step 3: Uploading to VM ━━━" -ForegroundColor Yellow
scp -i $SshKey -o StrictHostKeyChecking=no $ArchivePath "${VmUser}@${VmIp}:~/nexus-deploy.tar.gz"

# Step 4: Extract and deploy
Write-Host ""
Write-Host "━━━ Step 4: Deploying on VM ━━━" -ForegroundColor Yellow
ssh -i $SshKey -o StrictHostKeyChecking=no "$VmUser@$VmIp" @"
mkdir -p ~/nexus
cd ~/nexus
tar -xzf ~/nexus-deploy.tar.gz
rm ~/nexus-deploy.tar.gz
cd docker
cp .env.example .env 2>/dev/null || true
docker compose build --no-cache
docker compose up -d
sleep 10
docker compose ps
"@

# Step 5: Verify
Write-Host ""
Write-Host "━━━ Step 5: Verifying ━━━" -ForegroundColor Yellow
ssh -i $SshKey -o StrictHostKeyChecking=no "$VmUser@$VmIp" @"
curl -sf http://localhost:3001/health && echo ' ✅ API healthy' || echo ' ❌ API not responding'
curl -sf http://localhost:3000 > /dev/null && echo ' ✅ Web healthy' || echo ' ❌ Web not responding'
"@

# Done
Write-Host ""
Write-Host "╔═══════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║          Deployment Complete! 🚀              ║" -ForegroundColor Green
Write-Host "╠═══════════════════════════════════════════════╣" -ForegroundColor Green
Write-Host "║  Web:  http://${VmIp}:3000                    ║" -ForegroundColor Green
Write-Host "║  API:  http://${VmIp}:3001/api/v1             ║" -ForegroundColor Green
Write-Host "╚═══════════════════════════════════════════════╝" -ForegroundColor Green

# Cleanup
Remove-Item $ArchivePath -ErrorAction SilentlyContinue
