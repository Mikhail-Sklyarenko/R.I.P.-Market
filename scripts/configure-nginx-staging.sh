#!/usr/bin/env bash
# Harden the staging nginx: HTTP/2, security headers, asset caching, request
# limits, and no plaintext path into the API.
#
# Rewrites the site config, validates with `nginx -t`, and restores the previous
# config if validation fails — a broken config must never take the site down.
#
# Usage (on the server, as root):
#   bash scripts/configure-nginx-staging.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/staging-env.sh
source "$SCRIPT_DIR/lib/staging-env.sh"

SITE_AVAILABLE="/etc/nginx/sites-available/rip-market.conf"
SITE_ENABLED="/etc/nginx/sites-enabled/rip-market.conf"
HTTP_CONF="/etc/nginx/conf.d/rip-market-hardening.conf"
CERT_DIR="/etc/letsencrypt/live/${DOMAIN}"
BACKUP_DIR="/var/backups/rip-market-nginx"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

if [ ! -f "$CERT_DIR/fullchain.pem" ]; then
  echo "ERROR: no certificate at $CERT_DIR — run certbot first." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
if [ -f "$SITE_AVAILABLE" ]; then
  cp "$SITE_AVAILABLE" "$BACKUP_DIR/rip-market.conf.$STAMP"
  echo "==> Backed up current site config to $BACKUP_DIR/rip-market.conf.$STAMP"
fi
if [ -f "$HTTP_CONF" ]; then
  cp "$HTTP_CONF" "$BACKUP_DIR/hardening.conf.$STAMP"
fi

# nginx.conf ships `server_tokens build;` and `gzip on;` in the http block, so
# they must be changed in place rather than redeclared — a duplicate directive in
# the same context is a fatal config error.
echo "==> server_tokens off (in nginx.conf)"
sed -i -E 's/^([[:space:]]*)server_tokens[[:space:]]+[^;]+;/\1server_tokens off;/' /etc/nginx/nginx.conf
grep -nE '^[[:space:]]*server_tokens' /etc/nginx/nginx.conf

echo "==> http-level hardening ($HTTP_CONF)"
cat >"$HTTP_CONF" <<'EOF'
# Managed by scripts/configure-nginx-staging.sh — do not edit by hand.

# Per-IP request budget for the API. A human never approaches this; naive
# scraping and credential stuffing do. Zone survives reloads.
limit_req_zone $binary_remote_addr zone=rip_api:10m rate=30r/s;
limit_req_status 429;
limit_conn_zone $binary_remote_addr zone=rip_conn:10m;

gzip_vary on;
gzip_min_length 1024;
gzip_proxied any;
gzip_comp_level 6;
gzip_types
  application/javascript
  application/json
  application/manifest+json
  image/svg+xml
  text/css
  text/plain
  text/xml;
EOF

echo "==> site config ($SITE_AVAILABLE)"
cat >"$SITE_AVAILABLE" <<EOF
# Managed by scripts/configure-nginx-staging.sh — do not edit by hand.

# Unknown Host headers get nothing: no default page, no fingerprint. ACME stays
# reachable here so certificate renewal works for every name pointed at this host.
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/html;
        default_type "text/plain";
        try_files \$uri =404;
    }

    location / {
        return 444;
    }
}

server {
    listen 443 ssl default_server;
    listen [::]:443 ssl default_server;
    http2 on;
    server_name _;

    ssl_certificate ${CERT_DIR}/fullchain.pem;
    ssl_certificate_key ${CERT_DIR}/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    return 444;
}

server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} www.${DOMAIN};

    # Keep ACME reachable over plain HTTP so renewals never depend on the redirect.
    location ^~ /.well-known/acme-challenge/ {
        root /var/www/html;
        default_type "text/plain";
        try_files \$uri =404;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name ${DOMAIN} www.${DOMAIN};

    ssl_certificate ${CERT_DIR}/fullchain.pem;
    ssl_certificate_key ${CERT_DIR}/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    root ${APP_DIR}/frontend/dist;
    index index.html;

    client_max_body_size 1m;
    limit_conn rip_conn 64;

    # No includeSubDomains: api.${DOMAIN} has no certificate of its own, and
    # forcing HTTPS there would produce a hard cert error instead of a 404.
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=()" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://*.steamstatic.com; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self' https://steamcommunity.com; frame-ancestors 'none'; upgrade-insecure-requests" always;

    location /api/ {
        limit_req zone=rip_api burst=60 nodelay;

        proxy_pass http://127.0.0.1:3000/api/;
        proxy_http_version 1.1;
        # Inventory sync through the residential proxy is slow by nature.
        proxy_read_timeout 300;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Vite fingerprints asset filenames, so they can be cached indefinitely.
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable" always;
        access_log off;
        try_files \$uri =404;
    }

    location = /index.html {
        add_header Cache-Control "no-cache" always;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
EOF

ln -sf "$SITE_AVAILABLE" "$SITE_ENABLED"

# The stock default site would answer on the bare IP; our own default_server
# block replaces it.
if [ -L /etc/nginx/sites-enabled/default ]; then
  rm -f /etc/nginx/sites-enabled/default
  echo "==> Disabled stock default site"
fi

# The hoster's swtest.ru vhost proxies the whole API straight to the backend,
# which bypasses the headers and rate limits configured above. The product is
# served from ${DOMAIN} only.
if [ -f /etc/nginx/conf.d/docker-app.conf ]; then
  mv /etc/nginx/conf.d/docker-app.conf "$BACKUP_DIR/docker-app.conf.$STAMP.disabled"
  echo "==> Disabled provider vhost docker-app.conf (backup in $BACKUP_DIR)"
fi

echo "==> Validate"
if ! nginx -t; then
  echo "ERROR: nginx config invalid — restoring previous config." >&2
  if [ -f "$BACKUP_DIR/rip-market.conf.$STAMP" ]; then
    cp "$BACKUP_DIR/rip-market.conf.$STAMP" "$SITE_AVAILABLE"
  fi
  if [ -f "$BACKUP_DIR/hardening.conf.$STAMP" ]; then
    cp "$BACKUP_DIR/hardening.conf.$STAMP" "$HTTP_CONF"
  else
    rm -f "$HTTP_CONF"
  fi
  if [ -f "$BACKUP_DIR/docker-app.conf.$STAMP.disabled" ]; then
    mv "$BACKUP_DIR/docker-app.conf.$STAMP.disabled" /etc/nginx/conf.d/docker-app.conf
  fi
  nginx -t && systemctl reload nginx
  exit 1
fi

echo "==> Reload"
systemctl reload nginx

echo ""
echo "==> Response headers"
curl -sI "https://${DOMAIN}/" | grep -Ei 'HTTP/|strict-transport|content-security|x-frame|x-content-type|referrer|permissions|server:' || true

echo ""
echo "nginx hardened. Rollback: cp $BACKUP_DIR/rip-market.conf.$STAMP $SITE_AVAILABLE && nginx -t && systemctl reload nginx"
