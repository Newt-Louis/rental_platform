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
  echo ""; echo "=== docker stats sorted by mem ==="; docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.CPUPerc}}" | (sed -u 1q; sort -t/ -k1 -h -r)
  echo ""; echo "=== top host processes by mem ==="; ps aux --sort=-%mem | head -20
  echo ""; echo "=== jenkins job branch config (leasing-deploy / leasing-deploy-prod) ==="
  docker exec jenkins-thiso sh -c "grep -oE \"<url>[^<]*</url>|<name>\\*/[^<]*</name>|refs/heads/[^<\\\"]*\" /var/jenkins_home/jobs/leasing-deploy/config.xml /var/jenkins_home/jobs/leasing-deploy-prod/config.xml 2>/dev/null"
  echo ""; echo "=== latest build per job: when + revision + commit msg ==="
  docker exec jenkins-thiso sh -c "for j in leasing-deploy leasing-deploy-prod; do d=/var/jenkins_home/jobs/\$j; last=\$(ls -1 \$d/builds | grep -E \"^[0-9]+\$\" | sort -n | tail -1); [ -z \"\$last\" ] && continue; echo \"--- \$j #\$last ---\"; ts=\$(grep -o \"<timestamp>[0-9]*</timestamp>\" \$d/builds/\$last/build.xml | grep -o \"[0-9]*\"); date -d @\$((ts/1000)) -u 2>/dev/null; grep \"Checking out Revision\|Commit message\" \$d/builds/\$last/log; done"
  echo ""; echo "=== jenkins-thiso container: recent logs (tail 100) ==="; docker logs --tail 100 jenkins-thiso 2>&1 || true
  echo ""; echo "=== buildx check ==="; docker exec jenkins-thiso docker buildx version 2>&1 || true
  echo ""; echo "=== network check: github.com from jenkins-thiso ==="
  docker exec jenkins-thiso sh -c "getent hosts github.com; curl -sS -m 8 -o /dev/null -w \"http_code=%{http_code} time=%{time_total}s\n\" https://github.com || echo CURL_FAILED" 2>&1 || true
  echo ""; echo "=== network check: github.com from host ==="
  getent hosts github.com; curl -sS -m 8 -o /dev/null -w "http_code=%{http_code} time=%{time_total}s\n" https://github.com || echo CURL_FAILED
  echo ""; echo "=== full raw log of leasing-deploy latest build ==="
  docker exec jenkins-thiso sh -c "d=/var/jenkins_home/jobs/leasing-deploy; last=\$(ls -1 \$d/builds | grep -E \"^[0-9]+\$\" | sort -n | tail -1); cat \$d/builds/\$last/log" 2>&1
  echo ""; echo "=== latest build per job (result + last 80 lines) ==="
  docker exec jenkins-thiso sh -c "for j in leasing-deploy leasing-deploy-prod; do d=/var/jenkins_home/jobs/\$j; last=\$(ls -1 \$d/builds | grep -E \"^[0-9]+\$\" | sort -n | tail -1); [ -z \"\$last\" ] && continue; ts=\$(stat -c %Y \$d/builds/\$last/log 2>/dev/null); echo \"--- \$j #\$last (log mtime epoch \$ts) ---\"; grep -iE \"ERROR|FAILURE|Exception|npm ERR|exit code|denied|failed\" \$d/builds/\$last/log | sed -n \"1,60p\"; echo \"== tail ==\"; tail -n 80 \$d/builds/\$last/log; done" 2>&1 || true
' < /dev/null
