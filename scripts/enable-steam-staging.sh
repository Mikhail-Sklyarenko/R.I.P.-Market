#!/usr/bin/env bash
# Enable Steam auth + real inventory + mock trade on staging VPS.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/rip-market}"
STEAM_WEB_API_KEY="${STEAM_WEB_API_KEY:?set STEAM_WEB_API_KEY}"

# Preserve existing JWT_SECRET if present
JWT_SECRET="$(grep '^JWT_SECRET=' "$APP_DIR/backend/.env" | cut -d= -f2- | tr -d '"')"

cat >"$APP_DIR/backend/.env" <<EOF
DATABASE_URL="postgresql://cs2:cs2@localhost:5432/cs2_p2p_mvp?schema=public"
PORT=3000
JWT_SECRET="${JWT_SECRET}"
JWT_EXPIRES_IN="7d"
FRONTEND_ORIGIN="https://p2pcs.ru,https://www.p2pcs.ru,http://p2pcs.ru,http://www.p2pcs.ru,http://31.177.83.107"

AUTH_PROVIDER=steam
INVENTORY_PROVIDER=steam
TRADE_PROVIDER=mock
ENABLE_MOCK_TRADE=true
ENABLE_MOCK_DEPOSIT=true
ENABLE_TEST_ROUTES=false
PAYMENT_PROVIDER=mock

STEAM_OPENID_REALM=https://p2pcs.ru
API_PUBLIC_URL=https://p2pcs.ru/api/v1
STEAM_WEB_API_KEY=${STEAM_WEB_API_KEY}
ALLOW_MOCK_LOGIN_IN_STEAM_MODE=true

INVENTORY_SYNC_TTL_SECONDS=300
INVENTORY_SYNC_MIN_INTERVAL_MS=60000
EOF

systemctl restart rip-market-backend
sleep 3
curl -sf http://127.0.0.1:3000/api/v1/health
echo ""
curl -sf http://127.0.0.1:3000/api/v1/auth/config
echo ""
