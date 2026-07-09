#!/usr/bin/env bash
# One-shot staging deploy for a fresh Ubuntu VPS (mock providers, no crypto-gateway).
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/rip-market}"
REPO_URL="${REPO_URL:-https://github.com/Mikhail-Sklyarenko/R.I.P.-Market.git}"
DOMAIN="${DOMAIN:-p2pcs.ru}"
API_DOMAIN="${API_DOMAIN:-api.p2pcs.ru}"
SERVER_IP="${SERVER_IP:-}"

echo "==> Stopping preinstalled Next.js stack (if any)"
if [ -d /home/docker-app ]; then
  (cd /home/docker-app && docker compose down) || true
fi

echo "==> Swap (2G) for low-RAM VPS"
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> Node.js 22"
if ! command -v node >/dev/null 2>&1; then
  export DEBIAN_FRONTEND=noninteractive
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs git
fi
node -v
npm -v

echo "==> Clone / update app"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" pull --ff-only
else
  git clone "$REPO_URL" "$APP_DIR"
fi

JWT_SECRET="$(openssl rand -hex 32)"
ORIGINS="https://${DOMAIN},https://www.${DOMAIN},http://${DOMAIN},http://www.${DOMAIN}"
if [ -n "$SERVER_IP" ]; then
  ORIGINS="${ORIGINS},http://${SERVER_IP}"
fi

echo "==> Backend .env"
cat >"$APP_DIR/backend/.env" <<EOF
DATABASE_URL="postgresql://cs2:cs2@localhost:5432/cs2_p2p_mvp?schema=public"
PORT=3000
JWT_SECRET="${JWT_SECRET}"
JWT_EXPIRES_IN="7d"
FRONTEND_ORIGIN="${ORIGINS}"
AUTH_PROVIDER=mock
INVENTORY_PROVIDER=mock
TRADE_PROVIDER=mock
ENABLE_MOCK_TRADE=true
ENABLE_MOCK_DEPOSIT=true
ENABLE_TEST_ROUTES=false
PAYMENT_PROVIDER=mock
EOF

echo "==> Frontend .env"
cat >"$APP_DIR/frontend/.env" <<EOF
VITE_API_BASE_URL=https://${DOMAIN}/api/v1
VITE_ENABLE_MOCK_TRADE=true
VITE_STAGING=true
VITE_SUPPORT_EMAIL=support@${DOMAIN}
EOF

echo "==> PostgreSQL (Docker)"
cd "$APP_DIR/backend"
docker compose up -d
for i in $(seq 1 30); do
  if docker compose exec -T postgres pg_isready -U cs2 -d cs2_p2p_mvp >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

echo "==> Backend build"
npm ci
npm run prisma:generate
npm run prisma:migrate:deploy
npm run build

echo "==> Frontend build"
cd "$APP_DIR/frontend"
npm ci
npm run build

echo "==> systemd: rip-market-backend"
cat >/etc/systemd/system/rip-market-backend.service <<EOF
[Unit]
Description=R.I.P. Market Backend
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${APP_DIR}/backend
EnvironmentFile=${APP_DIR}/backend/.env
ExecStart=$(command -v node) dist/src/main.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable rip-market-backend
systemctl restart rip-market-backend

echo "==> nginx site"
cat >/etc/nginx/sites-available/rip-market.conf <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} www.${DOMAIN};

    root ${APP_DIR}/frontend/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:3000/api/;
        proxy_http_version 1.1;
        proxy_read_timeout 300;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}

server {
    listen 80;
    listen [::]:80;
    server_name ${API_DOMAIN};

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_read_timeout 300;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

ln -sf /etc/nginx/sites-available/rip-market.conf /etc/nginx/sites-enabled/rip-market.conf
nginx -t
systemctl reload nginx

echo "==> Health check"
sleep 3
curl -sf "http://127.0.0.1:3000/api/v1/health" | head -c 200
echo ""
echo "Deploy complete. Point DNS A records for ${DOMAIN} and ${API_DOMAIN} to this server, then run:"
echo "  certbot --nginx -d ${DOMAIN} -d www.${DOMAIN} -d ${API_DOMAIN}"
