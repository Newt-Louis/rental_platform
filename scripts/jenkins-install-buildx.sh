#!/usr/bin/env bash
# jenkins-install-buildx.sh — Cài docker-buildx-plugin vào container Jenkins
# đang chạy trên server .82. Cần vì Jenkinsfile hiện bật DOCKER_BUILDKIT=1
# (để build cache không bị "docker image prune" xoá mất sau mỗi build) nhưng
# docker CLI trong container jenkins-thiso (cài theo scripts/jenkins-setup.sh)
# chưa có buildx -- Docker 26.x bắt buộc cần buildx khi BuildKit được bật,
# không tự fallback về builder cũ nữa.
#
# Chỉ cài thêm 1 gói apt vào container đang chạy, KHÔNG restart Jenkins,
# KHÔNG đổi cấu hình/job nào.
set -euo pipefail
cd "$(dirname "$0")/.."

CREDS_FILE="docs-private/info-env.prd"
if [[ ! -f "$CREDS_FILE" ]]; then
  echo "✗ Không tìm thấy $CREDS_FILE" >&2
  exit 1
fi
mapfile -t CREDS < <(tr -d '\r' < "$CREDS_FILE")
SERVER_HOST="${CREDS[0]}"
SERVER_USER="${CREDS[1]}"
SERVER_PASS="${CREDS[2]}"

_ASKPASS_TMP="${TEMP:-/tmp}/ssh_askpass_buildx_$$.sh"
printf '#!/usr/bin/env bash\necho "%s"\n' "${SERVER_PASS}" > "$_ASKPASS_TMP"
chmod +x "$_ASKPASS_TMP"
trap 'rm -f "$_ASKPASS_TMP"' EXIT

SSH_ASKPASS="$_ASKPASS_TMP" SSH_ASKPASS_REQUIRE=force ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 "${SERVER_USER}@${SERVER_HOST}" '
  set -e
  echo "=== apt-get update (jenkins-thiso) ==="
  docker exec -u root jenkins-thiso apt-get update
  echo "=== install docker-buildx-plugin ==="
  docker exec -u root jenkins-thiso apt-get install -y docker-buildx-plugin
  echo "=== verify ==="
  docker exec jenkins-thiso docker buildx version
' < /dev/null
