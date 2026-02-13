#!/bin/bash
# =============================================================
# NEXUS Platform - Oracle Cloud Deployment Script
# Deploys the full Nexus stack via Docker Compose on an OCI VM
# =============================================================

set -euo pipefail

# Configuration
VM_USER="${VM_USER:-ubuntu}"
VM_IP="${VM_IP:?ERROR: Set VM_IP environment variable}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/nexus-oracle}"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "╔═══════════════════════════════════════════════╗"
echo "║       NEXUS Platform - Oracle Deployment      ║"
echo "╚═══════════════════════════════════════════════╝"
echo ""
echo "→ Target: $VM_USER@$VM_IP"
echo "→ Key:    $SSH_KEY"
echo "→ Source: $PROJECT_DIR"
echo ""

SSH_CMD="ssh -i $SSH_KEY -o StrictHostKeyChecking=no $VM_USER@$VM_IP"
SCP_CMD="scp -i $SSH_KEY -o StrictHostKeyChecking=no"

# Step 1: Install Docker on remote VM
echo "━━━ Step 1: Installing Docker on VM ━━━"
$SSH_CMD << 'REMOTE_SCRIPT'
if ! command -v docker &> /dev/null; then
    echo "Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker $USER
    sudo systemctl enable docker
    sudo systemctl start docker
    echo "Docker installed successfully"
else
    echo "Docker already installed: $(docker --version)"
fi

if ! command -v docker compose &> /dev/null; then
    echo "Installing Docker Compose plugin..."
    sudo apt-get install -y docker-compose-plugin
fi
REMOTE_SCRIPT

# Step 2: Create project directory on VM
echo ""
echo "━━━ Step 2: Preparing remote directory ━━━"
$SSH_CMD "mkdir -p ~/nexus"

# Step 3: Transfer project files
echo ""
echo "━━━ Step 3: Transferring project files ━━━"

# Create a deployable archive (exclude node_modules, .git, etc.)
echo "Creating deployment archive..."
cd "$PROJECT_DIR"
tar --exclude='node_modules' \
    --exclude='.git' \
    --exclude='.turbo' \
    --exclude='.next' \
    --exclude='dist' \
    --exclude='*.tsbuildinfo' \
    -czf /tmp/nexus-deploy.tar.gz .

echo "Uploading to VM..."
$SCP_CMD /tmp/nexus-deploy.tar.gz "$VM_USER@$VM_IP:~/nexus-deploy.tar.gz"

echo "Extracting on VM..."
$SSH_CMD << 'REMOTE_EXTRACT'
cd ~/nexus
tar -xzf ~/nexus-deploy.tar.gz
rm ~/nexus-deploy.tar.gz
echo "Files extracted successfully"
REMOTE_EXTRACT

# Step 4: Setup environment
echo ""
echo "━━━ Step 4: Setting up environment ━━━"
$SSH_CMD << 'REMOTE_ENV'
cd ~/nexus/docker
if [ ! -f .env ]; then
    cp .env.example .env 2>/dev/null || true
    echo "Created .env from template — please review and update secrets"
fi
REMOTE_ENV

# Step 5: Build and start services
echo ""
echo "━━━ Step 5: Building and starting services ━━━"
$SSH_CMD << 'REMOTE_DEPLOY'
cd ~/nexus/docker
docker compose build --no-cache
docker compose up -d
echo ""
echo "Waiting for services to start..."
sleep 10
docker compose ps
REMOTE_DEPLOY

# Step 6: Verify
echo ""
echo "━━━ Step 6: Verifying deployment ━━━"
$SSH_CMD << 'REMOTE_VERIFY'
echo "Checking service health..."
curl -sf http://localhost:3001/health && echo " ✅ API healthy" || echo " ❌ API not responding"
curl -sf http://localhost:3000 > /dev/null && echo " ✅ Web healthy" || echo " ❌ Web not responding"
echo ""
echo "Container status:"
docker compose -f ~/nexus/docker/docker-compose.yml ps
REMOTE_VERIFY

echo ""
echo "╔═══════════════════════════════════════════════╗"
echo "║          Deployment Complete! 🚀              ║"
echo "╠═══════════════════════════════════════════════╣"
echo "║  Web:  http://$VM_IP:3000                     ║"
echo "║  API:  http://$VM_IP:3001/api/v1              ║"
echo "╚═══════════════════════════════════════════════╝"
