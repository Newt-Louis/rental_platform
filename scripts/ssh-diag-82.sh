#!/usr/bin/env bash
# ssh-diag-82.sh — Chẩn đoán CHỈ ĐỌC trên server Jenkins/prod (.82), dùng để
# tìm nguyên nhân Jenkins build chậm (tài nguyên server, container nào đang
# ăn CPU/RAM, disk có đầy không, log gần nhất của container jenkins-thiso).
#
# KHÔNG thay đổi trạng thái server — chỉ chạy uptime/free/df/docker ps/stats/logs.
# Chạy: bash scripts/ssh-diag-82.sh
set -euo pipefail
cd "$(dirname "$0")/.."

CREDS_FILE="docs-private/info-env.prd"
if [[ ! -f "$CREDS_FILE" ]]; then
  echo "✗ Không tìm thấy $CREDS_FILE. File này cần 3 dòng: IP, user, password." >&2
  exit 1
fi
mapfile -t CREDS < <(tr -d '\r' < "$CREDS_FILE")
SERVER_HOST="${CREDS[0]}"
SERVER_USER="${CREDS[1]}"
SERVER_PASS="${CREDS[2]}"

_ASKPASS_TMP="${TEMP:-/tmp}/ssh_askpass_diag82_$$.sh"
printf '#!/usr/bin/env bash\necho "%s"\n' "${SERVER_PASS}" > "$_ASKPASS_TMP"
chmod +x "$_ASKPASS_TMP"
trap 'rm -f "$_ASKPASS_TMP"' EXIT

SSH_ASKPASS="$_ASKPASS_TMP" SSH_ASKPASS_REQUIRE=force ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 "${SERVER_USER}@${SERVER_HOST}" '
  echo "=== uptime/load ==="; uptime
  echo ""; echo "=== cpu/mem ==="; nproc; free -h
  echo ""; echo "=== disk ==="; df -h /
  echo ""; echo "=== containers ==="; docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Image}}"
  echo ""; echo "=== docker stats (5s sample) ==="; timeout 5 docker stats --no-stream
  echo ""; echo "=== jenkins-thiso container: recent logs (tail 100) ==="; docker logs --tail 100 jenkins-thiso 2>&1 || true
  echo ""; echo "=== docker / buildkit version ==="; docker version; docker exec jenkins-thiso docker version 2>&1 || true
' < /dev/null
