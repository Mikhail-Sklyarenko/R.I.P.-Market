#!/usr/bin/env bash
# Phase 1 — enable USDT deposits on p2pcs staging while keeping Steam + mock trade.
# Preserves JWT_SECRET and Steam settings from existing backend/.env when present.
#
# Required env (export before run):
#   CRYPTO_GATEWAY_API_KEY
#   CRYPTO_GATEWAY_WEBHOOK_SECRET
#
# Optional:
#   APP_DIR (default /opt/rip-market)
#   DOMAIN (default p2pcs.ru)
#   GATEWAY_URL (default http://127.0.0.1:3001)

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/rip-market}"
DOMAIN="${DOMAIN:-p2pcs.ru}"
GATEWAY_URL="${GATEWAY_URL:-http://127.0.0.1:3001}"
ENV_PATH="$APP_DIR/backend/.env"

CRYPTO_GATEWAY_API_KEY="${CRYPTO_GATEWAY_API_KEY:?set CRYPTO_GATEWAY_API_KEY}"
CRYPTO_GATEWAY_WEBHOOK_SECRET="${CRYPTO_GATEWAY_WEBHOOK_SECRET:?set CRYPTO_GATEWAY_WEBHOOK_SECRET}"

read_env_value() {
  local key="$1"
  local default="$2"
  if [ -f "$ENV_PATH" ] && grep -q "^${key}=" "$ENV_PATH"; then
    grep "^${key}=" "$ENV_PATH" | head -n1 | cut -d= -f2- | tr -d '"'
  else
    echo "$default"
  fi
}

JWT_SECRET="$(read_env_value JWT_SECRET "$(openssl rand -hex 32)")"
STEAM_WEB_API_KEY="$(read_env_value STEAM_WEB_API_KEY "")"
AUTH_PROVIDER="$(read_env_value AUTH_PROVIDER steam)"
INVENTORY_PROVIDER="$(read_env_value INVENTORY_PROVIDER steam)"
TRADE_PROVIDER="$(read_env_value TRADE_PROVIDER mock)"
STEAM_OPENID_REALM="$(read_env_value STEAM_OPENID_REALM "https://${DOMAIN}")"
API_PUBLIC_URL="$(read_env_value API_PUBLIC_URL "https://${DOMAIN}/api/v1")"
ALLOW_MOCK="$(read_env_value ALLOW_MOCK_LOGIN_IN_STEAM_MODE true)"

ORIGINS="https://${DOMAIN},https://www.${DOMAIN},http://${DOMAIN},http://www.${DOMAIN}"

cat >"$ENV_PATH" <<EOF
DATABASE_URL="postgresql://cs2:cs2@localhost:5432/cs2_p2p_mvp?schema=public"
PORT=3000
JWT_SECRET="${JWT_SECRET}"
JWT_EXPIRES_IN="7d"
FRONTEND_ORIGIN="${ORIGINS}"

# Auth + inventory (Steam on p2pcs)
AUTH_PROVIDER=${AUTH_PROVIDER}
INVENTORY_PROVIDER=${INVENTORY_PROVIDER}
TRADE_PROVIDER=${TRADE_PROVIDER}
ENABLE_MOCK_TRADE=true
ENABLE_MOCK_DEPOSIT=false
ENABLE_TEST_ROUTES=false
ALLOW_MOCK_LOGIN_IN_STEAM_MODE=${ALLOW_MOCK}

STEAM_OPENID_REALM=${STEAM_OPENID_REALM}
API_PUBLIC_URL=${API_PUBLIC_URL}
STEAM_WEB_API_KEY=${STEAM_WEB_API_KEY}

INVENTORY_SYNC_TTL_SECONDS=300
INVENTORY_SYNC_MIN_INTERVAL_MS=60000

# Phase 4 trade — shadow until Gate 4 complete (do not enable real settlement yet)
TRADE_VERIFICATION_MODE=shadow
ENABLE_REAL_SETTLEMENT=false

# Phase 1 — USDT deposits (withdrawals need signer + manual review)
PAYMENT_PROVIDER=crypto_tron
CRYPTO_GATEWAY_URL=${GATEWAY_URL}
CRYPTO_GATEWAY_API_KEY=${CRYPTO_GATEWAY_API_KEY}
CRYPTO_GATEWAY_WEBHOOK_SECRET=${CRYPTO_GATEWAY_WEBHOOK_SECRET}
MIN_DEPOSIT_MINOR=500
MIN_WITHDRAW_MINOR=2000
WITHDRAW_FEE_MINOR=200
WITHDRAW_MANUAL_REVIEW=true
WITHDRAW_MANUAL_REVIEW_COUNT=3
WITHDRAW_REQUIRE_STEAM_LINKED=true
WITHDRAW_DAILY_CAP_MINOR=50000
EOF

echo "==> Frontend .env (crypto UI + QA mock deposit for testers)"
cat >"$APP_DIR/frontend/.env" <<EOF
VITE_API_BASE_URL=https://${DOMAIN}/api/v1
VITE_ENABLE_MOCK_TRADE=false
VITE_STAGING=true
VITE_QA_MOCK_DEPOSIT=true
VITE_SUPPORT_EMAIL=support@${DOMAIN}
EOF

echo "==> Rebuild frontend"
cd "$APP_DIR/frontend"
npm run build

echo "==> Restart backend"
systemctl restart rip-market-backend
sleep 3

echo "==> Health"
curl -sf "http://127.0.0.1:3000/api/v1/health" | head -c 400
echo ""
echo "==> Auth config"
curl -sf "http://127.0.0.1:3000/api/v1/auth/config" | head -c 600
echo ""
echo ""
echo "Phase 1 enabled. Next: bash scripts/verify-payments-readiness.sh"
echo "Ensure .env.staging PLATFORM_WEBHOOK_URL=https://${DOMAIN}/api/v1/payments/webhooks/crypto"
