#!/bin/bash
# =============================================================================
# THISO Leasing Platform — Server Deployment Script
# Usage: ./scripts/deploy.sh [first-run|update|rollback]
# =============================================================================
set -euo pipefail

APP_DIR="/home/leasing-platform"
REPO_URL="https://github.com/hungnguyen9xx/Leasing.git"
BRANCH="main"
ACTION="${1:-update}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()   { echo -e "${GREEN}[$(date '+%H:%M:%S')] ✓ $*${NC}"; }
warn()  { echo -e "${YELLOW}[$(date '+%H:%M:%S')] ⚠ $*${NC}"; }
error() { echo -e "${RED}[$(date '+%H:%M:%S')] ✗ $*${NC}"; exit 1; }
info()  { echo -e "${BLUE}[$(date '+%H:%M:%S')] → $*${NC}"; }

# ─── Check prerequisites ────────────────────────────────────────────────────
check_deps() {
  for cmd in docker git; do
    command -v "$cmd" &>/dev/null || error "$cmd is not installed. Run: sudo apt install -y $cmd"
  done
  docker compose version &>/dev/null || error "Docker Compose plugin not found. See setup guide."
  log "Prerequisites OK"
}

# ─── First-run: clone + setup ────────────────────────────────────────────────
first_run() {
  info "=== FIRST RUN SETUP ==="

  if [[ -d "$APP_DIR" ]]; then
    warn "Directory $APP_DIR already exists. Use 'update' instead, or remove it first."
    exit 1
  fi

  # Clone repo (will prompt for PAT if not embedded in URL)
  info "Cloning repository..."
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
  cd "$APP_DIR"

  # Check .env files
  if [[ ! -f ".env" ]]; then
    cp .env.docker .env
    warn "Created .env from .env.docker — EDIT this file before continuing!"
    warn "  nano .env"
    warn "Set: POSTGRES_PASSWORD, JWT_SECRET, ANTHROPIC_API_KEY (optional)"
    echo ""
    read -rp "Press ENTER after editing .env to continue..."
  fi

  if [[ ! -f "apps/backend/.env" ]]; then
    cp apps/backend/.env.example apps/backend/.env
    warn "Created apps/backend/.env — check values are correct!"
  fi

  # Build images
  info "Building Docker images (this takes 5-10 min on first run)..."
  docker compose build

  # Run migrations + seed
  info "Running database migrations..."
  SEED_DATABASE=true docker compose --profile migrate up migrate
  log "Migrations complete"

  # Start all services
  info "Starting services..."
  docker compose up -d

  # Wait for health
  info "Waiting for services to be healthy..."
  sleep 15
  docker compose ps

  log "=== FIRST RUN COMPLETE ==="
  show_urls
}

# ─── Update: pull + rebuild changed services ────────────────────────────────
update() {
  info "=== DEPLOYING UPDATE ==="
  cd "$APP_DIR"

  # Save current commit for potential rollback
  PREV_COMMIT=$(git rev-parse HEAD)
  echo "$PREV_COMMIT" > /tmp/leasing_prev_commit

  # Pull latest code
  info "Pulling latest code from $BRANCH..."
  git fetch origin
  git reset --hard "origin/$BRANCH"
  NEW_COMMIT=$(git rev-parse HEAD)

  if [[ "$PREV_COMMIT" == "$NEW_COMMIT" ]]; then
    warn "No new commits. Already up to date."
    exit 0
  fi

  log "Updated: ${PREV_COMMIT:0:7} → ${NEW_COMMIT:0:7}"

  # Check if migrations changed
  if git diff --name-only "$PREV_COMMIT" "$NEW_COMMIT" | grep -q "prisma/migrations"; then
    info "New migrations detected — running migrate..."
    docker compose --profile migrate up migrate
    log "Migrations applied"
  fi

  # Rebuild changed services
  info "Rebuilding and restarting services..."
  docker compose build --no-cache backend frontend
  docker compose up -d --force-recreate backend frontend

  # Health check
  info "Waiting for services..."
  sleep 20
  docker compose ps

  log "=== DEPLOY COMPLETE ==="
  show_urls
}

# ─── Rollback ───────────────────────────────────────────────────────────────
rollback() {
  info "=== ROLLBACK ==="
  cd "$APP_DIR"

  if [[ ! -f /tmp/leasing_prev_commit ]]; then
    error "No previous commit saved. Cannot rollback."
  fi

  PREV_COMMIT=$(cat /tmp/leasing_prev_commit)
  warn "Rolling back to $PREV_COMMIT..."
  git reset --hard "$PREV_COMMIT"

  docker compose build --no-cache backend frontend
  docker compose up -d --force-recreate backend frontend

  sleep 15
  docker compose ps
  log "=== ROLLBACK COMPLETE ==="
}

show_urls() {
  SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  Frontend : http://${SERVER_IP}:8080"
  echo "  Backend  : http://${SERVER_IP}:3000/api"
  echo "  Health   : http://${SERVER_IP}:3000/api/health"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

# ─── Main ────────────────────────────────────────────────────────────────────
check_deps

case "$ACTION" in
  first-run) first_run ;;
  update)    update ;;
  rollback)  rollback ;;
  *) error "Unknown action: $ACTION. Use: first-run | update | rollback" ;;
esac
