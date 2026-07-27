#!/usr/bin/env bash
# Phase 2a — real Steam trade verification in SHADOW mode (no auto-settle).
# Combines Phase 1 crypto + TRADE_PROVIDER=steam + extension-first flow.
#
# Required:
#   STEAM_WEB_API_KEY
#   CRYPTO_GATEWAY_API_KEY + CRYPTO_GATEWAY_WEBHOOK_SECRET (or already in backend/.env)
#
# Optional:
#   STEAM_HTTP_PROXY
#   EXTENSION_INTERNAL_STEAM_IDS — comma-separated; enables rollout stage=internal
#   APP_DIR, DOMAIN, GATEWAY_URL
#
# Usage:
#   export STEAM_WEB_API_KEY=...
#   export CRYPTO_GATEWAY_API_KEY=...
#   export CRYPTO_GATEWAY_WEBHOOK_SECRET=...
#   bash scripts/enable-phase2-shadow-trade-staging.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/staging-env.sh
source "$SCRIPT_DIR/lib/staging-env.sh"

STEAM_WEB_API_KEY="$(require_env_or_file STEAM_WEB_API_KEY STEAM_WEB_API_KEY)"
CRYPTO_GATEWAY_API_KEY="$(require_env_or_file CRYPTO_GATEWAY_API_KEY CRYPTO_GATEWAY_API_KEY)"
CRYPTO_GATEWAY_WEBHOOK_SECRET="$(require_env_or_file CRYPTO_GATEWAY_WEBHOOK_SECRET CRYPTO_GATEWAY_WEBHOOK_SECRET)"

JWT_SECRET="$(read_env_value JWT_SECRET "$(openssl rand -hex 32)")"
STEAM_HTTP_PROXY="$(read_env_value STEAM_HTTP_PROXY "")"
ORIGINS="$(staging_origins)"

EXTENSION_ROLLOUT_BLOCK=""
if [ -n "${EXTENSION_INTERNAL_STEAM_IDS:-}" ]; then
  EXTENSION_ROLLOUT_BLOCK="
ENABLE_EXTENSION_ROLLOUT=true
EXTENSION_ROLLOUT_STAGE=internal
EXTENSION_ROLLOUT_KILL_SWITCH=false
EXTENSION_ROLLOUT_INFLIGHT_GRACE=true
EXTENSION_ROLLOUT_INTERNAL_STEAM_IDS=${EXTENSION_INTERNAL_STEAM_IDS}"
else
  EXTENSION_ROLLOUT_BLOCK="
ENABLE_EXTENSION_ROLLOUT=false"
fi

cat >"$ENV_PATH" <<EOF
DATABASE_URL="postgresql://cs2:cs2@localhost:5432/cs2_p2p_mvp?schema=public"
PORT=3000
JWT_SECRET="${JWT_SECRET}"
JWT_EXPIRES_IN="7d"
FRONTEND_ORIGIN="${ORIGINS}"

AUTH_PROVIDER=steam
INVENTORY_PROVIDER=steam
TRADE_PROVIDER=steam
ENABLE_MOCK_TRADE=true
ENABLE_MOCK_DEPOSIT=false
ENABLE_TEST_ROUTES=false
ALLOW_MOCK_LOGIN_IN_STEAM_MODE=true

STEAM_OPENID_REALM=https://${DOMAIN}
API_PUBLIC_URL=https://${DOMAIN}/api/v1
STEAM_WEB_API_KEY=${STEAM_WEB_API_KEY}
STEAM_HTTP_PROXY=${STEAM_HTTP_PROXY}

INVENTORY_SYNC_TTL_SECONDS=300
INVENTORY_SYNC_MIN_INTERVAL_MS=60000
STEAM_MARKET_PRICE_ENABLED=true

# Phase 2a — shadow verification (poll runs, no auto status/ledger)
TRADE_VERIFICATION_MODE=shadow
ENABLE_REAL_SETTLEMENT=false
TRADE_TIMEOUT_MINUTES=60

# Phase 1 — USDT deposits
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
WITHDRAW_MIN_COMPLETED_SALES=0

# Extension-first trade (Phase 5)
ENABLE_EXTENSION_CHANNEL=true
${EXTENSION_ROLLOUT_BLOCK}
ENABLE_EXTENSION_TASK_PIPELINE=true
ENABLE_EXTENSION_OFFER_ORCHESTRATOR=true
ENABLE_EXTENSION_TRADE_REFERENCE=true
ENABLE_EXTENSION_UI_TRADE_FLOW=true
ENABLE_EXTENSION_TRADE_ACKNOWLEDGMENT=true
ENABLE_TRADE_REFERENCE_RECONCILE=true
ENABLE_EXTENSION_FIRST_TRADE_FLOW=false
ENABLE_DELIVERY_VERIFICATION_ENGINE=true
ENABLE_SETTLEMENT_HOLD_WINDOW=false
ENABLE_EXTENSION_DISPUTE_BRIDGE=false
ENABLE_EXTENSION_FLOW_OBSERVABILITY=true
EOF

echo "==> Backend migrate + build"
cd "$APP_DIR/backend"
npm run prisma:migrate:deploy
npm run build

write_frontend_env true
build_browser_extension
rebuild_frontend

echo "==> Restart backend"
restart_backend

echo "==> Auth config"
curl -sf "http://127.0.0.1:3000/api/v1/auth/config" | head -c 800
echo ""
echo ""
echo "Phase 2a (shadow trade) enabled."
echo "Next: 5–10 real deals → admin shadow snapshots → bash scripts/enable-phase2-live-trade-staging.sh"
echo "Verify: bash scripts/verify-trade-readiness.sh"
