#!/usr/bin/env bash
# Deploy Phase 5 extension flow on p2pcs.ru staging VPS.
# Run ON the server as root: bash /opt/rip-market/scripts/deploy-extension-staging.sh
#
# Money mode is the default: mockTrade/mockDeposit stay OFF and crypto_tron is
# preserved when secrets already exist. Opt into legacy QA mocks with:
#   STAGING_QA_MOCK_MONEY=1 bash scripts/deploy-extension-staging.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/rip-market}"
DOMAIN="${DOMAIN:-p2pcs.ru}"
# Stable extension ID from browser-extension/manifest.json "key" field
EXTENSION_ID="${VITE_EXTENSION_ID:-gmmlnkjdbcoojbhndjcfehojknjamaoj}"

echo "==> Pull latest code"
git -C "$APP_DIR" pull --ff-only

# Re-exec after pull so this run uses the updated script (bash loads the file at start).
if [ "${DEPLOY_EXTENSION_STAGING_REEXEC:-}" != "1" ]; then
  export DEPLOY_EXTENSION_STAGING_REEXEC=1
  exec bash "$APP_DIR/scripts/deploy-extension-staging.sh" "$@"
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/staging-env.sh
source "$SCRIPT_DIR/lib/staging-env.sh"

echo "==> Read secrets from existing backend env files"
JWT_SECRET="$(read_env_value JWT_SECRET "")"
STEAM_WEB_API_KEY="$(read_secrets_value STEAM_WEB_API_KEY "$(read_env_value STEAM_WEB_API_KEY "")")"
if [ -z "$JWT_SECRET" ]; then
  echo "ERROR: JWT_SECRET missing in $ENV_PATH" >&2
  exit 1
fi

# Keep the proxy in .env.secrets only — .env is rewritten below and an empty
# value there would override the secret through systemd's load order.
if ensure_steam_proxy_secret; then
  echo "==> Steam proxy: loaded from $SECRETS_PATH"
else
  echo "WARN: STEAM_HTTP_PROXY missing — Steam OpenID/inventory/prices will use VPS IP (likely 403)." >&2
  echo "      Fix: STEAM_HTTP_PROXY='http://LOGIN:PASSWORD@gw.dataimpulse.com:823' bash scripts/configure-steam-proxy-staging.sh" >&2
fi

ORIGINS="https://${DOMAIN},https://www.${DOMAIN},http://${DOMAIN},http://www.${DOMAIN},http://31.177.83.107"

QA_MOCK="${STAGING_QA_MOCK_MONEY:-0}"
CRYPTO_GATEWAY_API_KEY="$(read_secrets_value CRYPTO_GATEWAY_API_KEY "$(read_env_value CRYPTO_GATEWAY_API_KEY "")")"
CRYPTO_GATEWAY_WEBHOOK_SECRET="$(read_secrets_value CRYPTO_GATEWAY_WEBHOOK_SECRET "$(read_env_value CRYPTO_GATEWAY_WEBHOOK_SECRET "")")"
EXISTING_PROVIDER="$(read_env_value PAYMENT_PROVIDER mock)"

if [ "$QA_MOCK" = "1" ]; then
  echo "==> QA mock money mode (STAGING_QA_MOCK_MONEY=1)"
  ENABLE_MOCK_TRADE=true
  ENABLE_MOCK_DEPOSIT=true
  PAYMENT_PROVIDER=mock
  VITE_MOCK_TRADE=true
  VITE_QA_MOCK_DEPOSIT=true
  PAYMENT_BLOCK="
PAYMENT_PROVIDER=mock
TRADE_VERIFICATION_MODE=live
ENABLE_REAL_SETTLEMENT=false"
else
  echo "==> Money-safe defaults (mocks OFF)"
  ENABLE_MOCK_TRADE=false
  ENABLE_MOCK_DEPOSIT=false
  VITE_MOCK_TRADE=false
  VITE_QA_MOCK_DEPOSIT=false
  if [ -n "$CRYPTO_GATEWAY_API_KEY" ] && [ -n "$CRYPTO_GATEWAY_WEBHOOK_SECRET" ]; then
    PAYMENT_PROVIDER=crypto_tron
    PAYMENT_BLOCK="
PAYMENT_PROVIDER=crypto_tron
CRYPTO_GATEWAY_URL=http://127.0.0.1:3001
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
TRADE_VERIFICATION_MODE=live
ENABLE_REAL_SETTLEMENT=false
TRADE_TIMEOUT_MINUTES=60"
  elif [ "$EXISTING_PROVIDER" = "crypto_tron" ] || [ "$EXISTING_PROVIDER" = "north" ]; then
    echo "ERROR: live PAYMENT_PROVIDER=${EXISTING_PROVIDER} but gateway secrets missing in $SECRETS_PATH / $ENV_PATH" >&2
    echo "Run: GENERATE_STAGING_XPUB=1 bash scripts/enable-money-staging.sh" >&2
    exit 1
  else
    echo "WARN: crypto gateway secrets not found — PAYMENT_PROVIDER stays mock until enable-money-staging.sh" >&2
    PAYMENT_PROVIDER=mock
    PAYMENT_BLOCK="
PAYMENT_PROVIDER=mock
TRADE_VERIFICATION_MODE=live
ENABLE_REAL_SETTLEMENT=false"
  fi
fi

echo "==> Backend .env (Steam + extension staging)"
cat >"$APP_DIR/backend/.env" <<EOF
DATABASE_URL="postgresql://cs2:cs2@localhost:5432/cs2_p2p_mvp?schema=public"
PORT=3000
HOST=127.0.0.1
JWT_SECRET="${JWT_SECRET}"
JWT_EXPIRES_IN="7d"
FRONTEND_ORIGIN="${ORIGINS}"
PUBLIC_SITE_URL="https://${DOMAIN}"

AUTH_PROVIDER=steam
INVENTORY_PROVIDER=steam
TRADE_PROVIDER=mock
ENABLE_MOCK_TRADE=${ENABLE_MOCK_TRADE}
ENABLE_MOCK_DEPOSIT=${ENABLE_MOCK_DEPOSIT}
ENABLE_TEST_ROUTES=false
ALLOW_MOCK_LOGIN_IN_STEAM_MODE=true

STEAM_OPENID_REALM=https://${DOMAIN}
API_PUBLIC_URL=https://${DOMAIN}/api/v1
STEAM_WEB_API_KEY=${STEAM_WEB_API_KEY}

INVENTORY_SYNC_TTL_SECONDS=300
INVENTORY_SYNC_MIN_INTERVAL_MS=60000
STEAM_MARKET_PRICE_ENABLED=true
REFERENCE_PRICE_ENABLED=false
OWNER_ADMIN_STEAM_IDS=76561198195181115
# Honest Steam catalog prices (no market.csgo.com fallback for display)
STEAM_PRICE_FALLBACK_ENABLED=false
STEAM_CATALOG_PRICE_GAP_MS=150
CATALOG_PRICE_BULK_REFRESH_ENABLED=true
${PAYMENT_BLOCK}

# Extension-first (staging QA — rollout gating off so any seller can test)
ENABLE_EXTENSION_CHANNEL=true
ENABLE_EXTENSION_ROLLOUT=false
ENABLE_EXTENSION_TASK_PIPELINE=true
ENABLE_EXTENSION_OFFER_ORCHESTRATOR=true
ENABLE_EXTENSION_TRADE_REFERENCE=true
# API send path is preferred when Steam accepts /tradeoffer/new/send.
# Trade Protected inventories often return HTTP 400 empty — UI autofill is the reliable path.
ENABLE_EXTENSION_UI_TRADE_FLOW=true
ENABLE_EXTENSION_TRADE_ACKNOWLEDGMENT=true
ENABLE_TRADE_REFERENCE_RECONCILE=true
ENABLE_EXTENSION_FIRST_TRADE_FLOW=false
# Required for extension Guard → inventory delivery confirmation on staging
# (TRADE_PROVIDER may stay mock for admin buttons; offers are still real Steam IDs).
ENABLE_DELIVERY_VERIFICATION_ENGINE=true
ENABLE_SETTLEMENT_HOLD_WINDOW=false
ENABLE_EXTENSION_DISPUTE_BRIDGE=false
ENABLE_EXTENSION_FLOW_OBSERVABILITY=false
EOF

echo "==> Backend: install, migrate, build"
cd "$APP_DIR/backend"
npm ci
npm run prisma:generate
npm run prisma:migrate:deploy
npm run build

echo "==> Frontend .env"
cat >"$APP_DIR/frontend/.env" <<EOF
VITE_API_BASE_URL=https://${DOMAIN}/api/v1
VITE_EXTENSION_ID=${EXTENSION_ID}
VITE_ENABLE_MOCK_TRADE=${VITE_MOCK_TRADE}
VITE_STAGING=true
VITE_QA_MOCK_DEPOSIT=${VITE_QA_MOCK_DEPOSIT}
VITE_SUPPORT_EMAIL=support@${DOMAIN}
EOF

echo "==> Browser extension build"
cd "$APP_DIR/extension"
npm ci
cd "$APP_DIR/browser-extension"
npm ci
npm run build
python3 "$APP_DIR/scripts/package-browser-extension.py"

echo "==> Frontend: install, build"
cd "$APP_DIR/frontend"
npm ci
rebuild_frontend

echo "==> Restart backend"
restart_backend

echo "==> Extension config"
curl -sf "http://127.0.0.1:3000/api/v1/auth/config" | python3 -m json.tool 2>/dev/null || \
  curl -sf "http://127.0.0.1:3000/api/v1/auth/config"
echo ""

echo "Deploy complete."
echo "  Site:      https://${DOMAIN}"
echo "  Extension: load unpacked browser-extension/dist (ID: ${EXTENSION_ID})"
echo "  Payment:   ${PAYMENT_PROVIDER} (mocks=${ENABLE_MOCK_TRADE})"
