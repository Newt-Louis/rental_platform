#!/bin/bash
# =============================================================================
# THISO Leasing Platform — SSL Certificate Setup
# Run once after server-setup.sh, before deploy.sh first-run
# Usage: sudo bash scripts/ssl-setup.sh
# =============================================================================
set -euo pipefail

DOMAIN="uatls.thisoretail.store"
EMAIL="hoanghung660@gmail.com"
NGINX_CONF="/etc/nginx/sites-available/leasing"
APP_DIR="/home/leasing-platform"

echo "→ Configuring nginx for domain: $DOMAIN"

# Copy nginx config
cp "$APP_DIR/scripts/nginx-site.conf" "$NGINX_CONF"

# Enable site
ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/leasing

# Disable default site if exists
rm -f /etc/nginx/sites-enabled/default

# Create certbot webroot
mkdir -p /var/www/certbot

# Test nginx config first (without SSL — cert not yet issued)
# Temporarily replace SSL block for initial cert issuance
cat > /etc/nginx/sites-available/leasing-temp <<'EOF'
server {
    listen 80;
    server_name uatls.thisoretail.store;
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
    location / {
        return 200 'OK';
        add_header Content-Type text/plain;
    }
}
EOF

ln -sf /etc/nginx/sites-available/leasing-temp /etc/nginx/sites-enabled/leasing
nginx -t && systemctl reload nginx
echo "✓ Nginx temporary config loaded"

# Issue SSL certificate
echo "→ Requesting SSL certificate from Let's Encrypt..."
certbot certonly \
  --webroot \
  --webroot-path /var/www/certbot \
  --email "$EMAIL" \
  --agree-tos \
  --no-eff-email \
  -d "$DOMAIN"

echo "✓ SSL certificate issued"

# Switch to full nginx config with SSL
ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/leasing
rm -f /etc/nginx/sites-available/leasing-temp
nginx -t && systemctl reload nginx
echo "✓ Nginx SSL config active"

# Auto-renew cron (runs at 3am on 1st and 15th of each month)
(crontab -l 2>/dev/null; echo "0 3 1,15 * * certbot renew --quiet && systemctl reload nginx") | crontab -

echo ""
echo "════════════════════════════════════════════"
echo "  SSL setup complete!"
echo "  Site will be live at: https://$DOMAIN"
echo "  after running: bash scripts/deploy.sh first-run"
echo "════════════════════════════════════════════"
