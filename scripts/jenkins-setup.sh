#!/usr/bin/env bash
# jenkins-setup.sh — Cài Jenkins (Docker container) lên server .82, tích hợp
# vào nginx + certbot CÓ SẴN trên server (server này là shared hosting cho
# nhiều dự án khác -- Supabase, elearning, chatwoot, QR system, sync services
# -- KHÔNG được tự chiếm port 80/443 hay đụng vào config của site khác).
#
# Chạy trong Git Bash, từ thư mục gốc project: bash scripts/jenkins-setup.sh
#
# Kiến trúc:
#  - Jenkins chạy trong 1 container Docker, image custom (thêm docker-ce-cli +
#    compose plugin + openssh-client vào jenkins/jenkins:lts-jdk17) để Jenkins
#    tự build image & chạy `docker compose` ngay trên daemon Docker có sẵn của
#    server (mount /var/run/docker.sock -- "Docker outside of Docker").
#  - Container CHỈ bind 127.0.0.1:18080 (không public trực tiếp, không dùng
#    8080 vì port đó đã bị container qrcode_nginx chiếm trên server này).
#  - KHÔNG tạo container nginx riêng. Thêm đúng 1 file
#    /etc/nginx/conf.d/jenkins.thisoretail.store.conf vào nginx CÓ SẴN (native,
#    không phải Docker) trên server, theo đúng pattern các site khác đang dùng
#    (vd leasing.thisoretail.store.conf): webroot challenge tại
#    /var/www/letsencrypt, cert qua certbot webroot có sẵn. Cert mới sẽ được
#    cron renew CÓ SẴN của server tự động gia hạn cùng các domain khác
#    (`certbot renew --quiet --deploy-hook "systemctl reload nginx"`), không
#    cần thêm cron riêng.
#  - Chỉ dùng `nginx -t` để validate rồi `systemctl reload nginx` (graceful,
#    không rớt kết nối các site khác) -- không bao giờ restart nginx.
#
# Yêu cầu trước khi chạy:
#  1. Đã trỏ DNS: jenkins.thisoretail.store -> 125.234.136.82 (A record).
#  2. docs-private/info-env.prd tồn tại (3 dòng: IP / user / password của .82).
set -euo pipefail
cd "$(dirname "$0")/.."

DOMAIN="jenkins.thisoretail.store"
JENKINS_PORT="18080"
JENKINS_CONTAINER="jenkins-thiso"
JENKINS_IMAGE_TAG="jenkins-thiso:lts"
JENKINS_VOLUME="jenkins_thiso_home"
BUILD_DIR="/root/jenkins-docker-build"
WEBROOT="/var/www/letsencrypt"
NGINX_CONF="/etc/nginx/conf.d/jenkins.thisoretail.store.conf"

# Whitelist IP được phép truy cập Jenkins UI qua domain (áp dụng ở server
# block 443, KHÔNG áp dụng cho đường ACME challenge port 80 -- Let's Encrypt
# xác minh domain từ IP của chính họ, không nằm trong whitelist này).
ALLOWED_IPS=(
  "58.186.1.45"
  "115.79.198.181"
  "115.79.197.123"
  "171.249.166.2"
  "10.100.116.230"
  "183.91.28.243"
  "14.241.226.237"
  "10.212.134.0/24"
  "125.234.136.90"
  "113.164.29.146"
  "222.253.43.210"
  "115.78.224.196"
)

CREDS_FILE="docs-private/info-env.prd"
if [[ ! -f "$CREDS_FILE" ]]; then
  echo "✗ Không tìm thấy $CREDS_FILE. File này cần 3 dòng: IP, user, password."
  exit 1
fi
mapfile -t CREDS < <(tr -d '\r' < "$CREDS_FILE")
SERVER_HOST="${CREDS[0]}"
SERVER_USER="${CREDS[1]}"
SERVER_PASS="${CREDS[2]}"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║          CÀI JENKINS (tích hợp nginx có sẵn) LÊN .82         ║"
echo "╠══════════════════════════════════════════════════════════════╣"
printf  "║  Server     :  %-46s║\n" "$SERVER_USER@$SERVER_HOST"
printf  "║  Domain     :  %-46s║\n" "$DOMAIN"
printf  "║  Jenkins bind: 127.0.0.1:%-35s║\n" "$JENKINS_PORT"
printf  "║  Whitelist  :  %-46s║\n" "${#ALLOWED_IPS[@]} IP (xem danh sách trong script)"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

_ASKPASS_TMP="${TEMP}/ssh_askpass_$$.sh"
printf '#!/usr/bin/env bash\necho "%s"\n' "${SERVER_PASS}" > "$_ASKPASS_TMP"
chmod +x "$_ASKPASS_TMP"
SSH() { SSH_ASKPASS="$_ASKPASS_TMP" SSH_ASKPASS_REQUIRE=force ssh -o StrictHostKeyChecking=no "${SERVER_USER}@${SERVER_HOST}" "$@"; }
cleanup() { rm -f "$_ASKPASS_TMP"; }
trap cleanup EXIT

# ── BƯỚC 1: Kiểm tra điều kiện ──────────────────────────────────────────────
echo "▶ [1/5] Kiểm tra điều kiện trước khi cài..."

RESOLVED_IP=$(getent hosts "$DOMAIN" 2>/dev/null | awk '{print $1}' | head -1 || true)
if [[ -z "$RESOLVED_IP" ]]; then
  RESOLVED_IP=$(nslookup "$DOMAIN" 2>/dev/null | awk '/^Address: /{print $2}' | tail -1 || true)
fi
if [[ "$RESOLVED_IP" != "$SERVER_HOST" ]]; then
  echo "  ✗ $DOMAIN hiện resolve ra '${RESOLVED_IP:-<không resolve được>}', chưa phải $SERVER_HOST."
  echo "    Hãy trỏ A record $DOMAIN -> $SERVER_HOST rồi chạy lại script này."
  exit 1
fi
echo "  ✓ DNS đã trỏ đúng: $DOMAIN -> $SERVER_HOST"

if SSH "docker inspect ${JENKINS_CONTAINER} >/dev/null 2>&1"; then
  echo "  ✗ Container '${JENKINS_CONTAINER}' đã tồn tại trên server -- không tự ý xoá/tạo lại."
  echo "    Muốn cài lại từ đầu, tự SSH vào và xoá thủ công trước:"
  echo "      docker rm -f ${JENKINS_CONTAINER} && docker volume rm ${JENKINS_VOLUME}"
  exit 1
fi

if SSH "ss -tlnp 2>/dev/null | grep -qE ':${JENKINS_PORT}[[:space:]]'"; then
  echo "  ✗ Port ${JENKINS_PORT} trên server đang được dùng bởi tiến trình khác. Đổi JENKINS_PORT trong script rồi chạy lại."
  exit 1
fi

if SSH "[[ -f ${NGINX_CONF} ]]"; then
  echo "  ✗ File ${NGINX_CONF} đã tồn tại trên server -- không tự ý ghi đè. Kiểm tra thủ công trước."
  exit 1
fi

if ! SSH "command -v certbot >/dev/null 2>&1 && systemctl is-active --quiet nginx"; then
  echo "  ✗ Không thấy certbot hoặc nginx service đang chạy trên server như kỳ vọng. Dừng lại để tránh cài sai."
  exit 1
fi
echo "  ✓ Port ${JENKINS_PORT} rảnh, chưa có container/config cũ, nginx+certbot sẵn sàng"
echo ""

# ── BƯỚC 2: Build custom Jenkins image (thêm docker CLI + compose + ssh) ────
echo "▶ [2/5] Build custom Jenkins image..."
SSH "
  set -e
  mkdir -p ${BUILD_DIR}
  cat > ${BUILD_DIR}/Dockerfile <<'DOCKERFILE_EOF'
FROM jenkins/jenkins:lts-jdk17
USER root
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl gnupg openssh-client && \\
    install -m 0755 -d /etc/apt/keyrings && \\
    curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc && \\
    chmod a+r /etc/apt/keyrings/docker.asc && \\
    . /etc/os-release && \\
    echo \"deb [arch=\$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian \$VERSION_CODENAME stable\" > /etc/apt/sources.list.d/docker.list && \\
    apt-get update && apt-get install -y --no-install-recommends docker-ce-cli docker-compose-plugin && \\
    rm -rf /var/lib/apt/lists/*
USER jenkins
DOCKERFILE_EOF
  docker build -t ${JENKINS_IMAGE_TAG} ${BUILD_DIR}
"
echo "  ✓ Build image xong"
echo ""

# ── BƯỚC 3: Chạy Jenkins container (docker-outside-of-docker) ───────────────
echo "▶ [3/5] Khởi chạy container Jenkins (chỉ bind 127.0.0.1:${JENKINS_PORT})..."
SSH "
  set -e
  DOCKER_GID=\$(stat -c '%g' /var/run/docker.sock)
  docker volume create ${JENKINS_VOLUME} >/dev/null
  docker run -d --name ${JENKINS_CONTAINER} \\
    --restart unless-stopped \\
    -p 127.0.0.1:${JENKINS_PORT}:8080 \\
    -v ${JENKINS_VOLUME}:/var/jenkins_home \\
    -v /var/run/docker.sock:/var/run/docker.sock \\
    -v /home/leasing-platform:/home/leasing-platform \\
    --group-add \$DOCKER_GID \\
    ${JENKINS_IMAGE_TAG}
"
echo "  ✓ Jenkins container đã chạy (chưa lộ ra internet, đợi nginx ở bước sau)"
echo ""

# ── BƯỚC 4: Thêm vhost nginx (phase 1 -- HTTP only để xin cert qua webroot) ─
echo "▶ [4/5] Thêm vhost nginx (tạm HTTP-only để xin cert qua webroot có sẵn)..."
SSH "
  set -e
  mkdir -p ${WEBROOT}
  cat > ${NGINX_CONF} <<NGINX_EOF
server {
    listen 80;
    server_name ${DOMAIN};

    location /.well-known/acme-challenge/ {
        root ${WEBROOT};
    }
    location / {
        return 200 'Jenkins setup in progress...';
        add_header Content-Type text/plain;
    }
}
NGINX_EOF
  nginx -t
  systemctl reload nginx
"
echo "  ✓ Vhost HTTP-only đã bật, nginx reload xong (không ảnh hưởng site khác)"
echo ""

echo "▶ Xin TLS certificate cho $DOMAIN qua certbot webroot có sẵn..."
SSH "
  set -e
  certbot certonly --webroot -w ${WEBROOT} -d ${DOMAIN} --non-interactive --agree-tos -m admin@thisoretail.store --no-eff-email
"
echo "  ✓ Cert đã cấp (cron renew có sẵn của server sẽ tự gia hạn cùng các domain khác)"
echo ""

# ── BƯỚC 5: Bật HTTPS + whitelist IP, proxy vào Jenkins ─────────────────────
echo "▶ [5/5] Bật HTTPS + whitelist IP, proxy vào Jenkins..."
ALLOW_LINES=""
for ip in "${ALLOWED_IPS[@]}"; do
  ALLOW_LINES+="    allow ${ip};\n"
done

SSH "
  set -e
  cat > ${NGINX_CONF} <<NGINX_EOF
server {
    listen 80;
    server_name ${DOMAIN};

    location /.well-known/acme-challenge/ {
        root ${WEBROOT};
    }
    location / {
        return 301 https://\\\$host\\\$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name ${DOMAIN};

    ssl_certificate     /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    client_max_body_size 20M;

$(printf '%b' "$ALLOW_LINES")    deny all;

    location / {
        proxy_pass         http://127.0.0.1:${JENKINS_PORT};
        proxy_set_header   Host \\\$host;
        proxy_set_header   X-Real-IP \\\$remote_addr;
        proxy_set_header   X-Forwarded-For \\\$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \\\$scheme;
        proxy_redirect     http:// https://;
        proxy_http_version 1.1;
        proxy_set_header   Connection \"\";
        proxy_buffering    off;
    }
}
NGINX_EOF
  nginx -t
  systemctl reload nginx
"
echo "  ✓ Nginx đã bật HTTPS + whitelist IP cho $DOMAIN (site khác không bị ảnh hưởng)"
echo ""

echo "▶ Lấy mật khẩu admin ban đầu của Jenkins..."
sleep 8
SSH "docker exec ${JENKINS_CONTAINER} cat /var/jenkins_home/secrets/initialAdminPassword 2>/dev/null || echo '(chưa sẵn sàng, đợi thêm rồi chạy: docker exec ${JENKINS_CONTAINER} cat /var/jenkins_home/secrets/initialAdminPassword)'"

echo ""
echo "══════════════════════════════════════════════════════════════"
echo "  ✓ Jenkins đã sẵn sàng tại https://${DOMAIN}"
echo "    (chỉ truy cập được từ ${#ALLOWED_IPS[@]} IP trong whitelist)"
echo ""
echo "  Bước tiếp theo (thủ công, làm 1 lần qua UI):"
echo "  1. Mở https://${DOMAIN}, nhập mật khẩu admin ban đầu ở trên"
echo "  2. Install suggested plugins + cài thêm 'SSH Agent Plugin'"
echo "  3. Tạo SSH key để Jenkins deploy sang UAT (.72):"
echo "       docker exec -it ${JENKINS_CONTAINER} ssh-keygen -t ed25519 -f /var/jenkins_home/.ssh/uat_deploy_key -N ''"
echo "       docker exec ${JENKINS_CONTAINER} cat /var/jenkins_home/.ssh/uat_deploy_key.pub"
echo "     Copy public key đó vào ~/.ssh/authorized_keys của root@125.234.136.72"
echo "     Trong Jenkins: Manage Jenkins -> Credentials -> thêm 'SSH Username with"
echo "     private key', ID = uat-deploy-key, username = root, private key lấy từ"
echo "     /var/jenkins_home/.ssh/uat_deploy_key trong container"
echo "  4. Tạo Pipeline job kiểu 'Pipeline script from SCM', trỏ vào repo Git"
echo "     (https://github.com/hungnguyen9xx/Leasing.git) + Jenkinsfile ở gốc repo"
echo "══════════════════════════════════════════════════════════════"
echo ""
