#!/usr/bin/env bash
set -euo pipefail

APP_DIR=/opt/rip-market

cat >/etc/nginx/sites-available/rip-market.conf <<'NGINX'
server {
    listen 80;
    listen [::]:80;
    server_name p2pcs.ru www.p2pcs.ru;

    root /opt/rip-market/frontend/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:3000/api/;
        proxy_http_version 1.1;
        proxy_read_timeout 300;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}

server {
    listen 80;
    listen [::]:80;
    server_name api.p2pcs.ru;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_read_timeout 300;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINX

nginx -t
systemctl reload nginx

cat >"$APP_DIR/frontend/.env" <<EOF
VITE_API_BASE_URL=https://p2pcs.ru/api/v1
VITE_ENABLE_MOCK_TRADE=true
VITE_STAGING=true
VITE_SUPPORT_EMAIL=support@p2pcs.ru
EOF

cd "$APP_DIR/frontend"
npm run build

sed -i 's|^FRONTEND_ORIGIN=.*|FRONTEND_ORIGIN="https://p2pcs.ru,https://www.p2pcs.ru,http://p2pcs.ru,http://www.p2pcs.ru,http://31.177.83.107"|' "$APP_DIR/backend/.env"
systemctl restart rip-market-backend

export DEBIAN_FRONTEND=noninteractive
apt-get install -y certbot python3-certbot-nginx
certbot --nginx -d p2pcs.ru -d www.p2pcs.ru --non-interactive --agree-tos -m support@p2pcs.ru --redirect || true

echo "Done. Test: curl -s https://p2pcs.ru/api/v1/health"
