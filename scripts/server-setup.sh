#!/bin/bash
# =============================================================================
# THISO Leasing Platform — Server Prerequisites Setup
# Run once as root on a fresh Ubuntu 22.04 / 24.04 server
# Usage: curl -fsSL <url> | sudo bash
#        OR: sudo bash server-setup.sh
# =============================================================================
set -euo pipefail

echo "================================================"
echo " THISO Leasing Platform — Server Setup"
echo " Ubuntu 22.04 / 24.04"
echo "================================================"

# ─── System update ──────────────────────────────────────────────────────────
apt-get update -y
apt-get upgrade -y

# ─── Install Docker ─────────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  echo "→ Installing Docker..."
  apt-get install -y ca-certificates curl gnupg lsb-release
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
  echo "✓ Docker installed"
else
  echo "✓ Docker already installed: $(docker --version)"
fi

# ─── Install utilities ──────────────────────────────────────────────────────
apt-get install -y git curl wget nano ufw htop

# ─── Create app user (runs app without root) ────────────────────────────────
if ! id "deploy" &>/dev/null; then
  useradd -m -s /bin/bash deploy
  usermod -aG docker deploy
  echo "✓ Created 'deploy' user"
else
  usermod -aG docker deploy
  echo "✓ User 'deploy' already exists"
fi

# ─── Firewall ───────────────────────────────────────────────────────────────
ufw allow OpenSSH
ufw allow 8080/tcp   # Frontend
ufw allow 3000/tcp   # Backend API (optional — restrict after nginx setup)
ufw --force enable
echo "✓ Firewall configured"

# ─── Create app directory ───────────────────────────────────────────────────
mkdir -p /opt/leasing-platform
chown deploy:deploy /opt/leasing-platform

echo ""
echo "================================================"
echo " Setup complete!"
echo " Next step: login as deploy user and run:"
echo "   sudo -u deploy bash"
echo "   cd /opt"
echo "   bash /opt/leasing-platform/scripts/deploy.sh first-run"
echo "================================================"
