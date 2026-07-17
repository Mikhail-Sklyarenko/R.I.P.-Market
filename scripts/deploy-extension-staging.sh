#!/usr/bin/env bash
# Deploy Phase 5 extension flow on p2pcs.ru staging VPS.
# Run ON the server as root: bash /opt/rip-market/scripts/deploy-extension-staging.sh
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

echo "==> Read secrets from existing backend .env"
JWT_SECRET="$(grep '^JWT_SECRET=' "$APP_DIR/backend/.env" | cut -d= -f2- | tr -d '"')"
STEAM_WEB_API_KEY="$(grep '^STEAM_WEB_API_KEY=' "$APP_DIR/backend/.env" | cut -d= -f2- | tr -d '"' || true)"
STEAM_HTTP_PROXY="$(grep '^STEAM_HTTP_PROXY=' "$APP_DIR/backend/.env" | cut -d= -f2- | tr -d '"' || true)"
if [ -z "$JWT_SECRET" ]; then
  echo "ERROR: JWT_SECRET missing in $APP_DIR/backend/.env" >&2
  exit 1
fi
if [ -z "$STEAM_HTTP_PROXY" ]; then
  echo "WARN: STEAM_HTTP_PROXY missing — Steam OpenID/inventory/prices will use VPS IP (likely 403)." >&2
fi

ORIGINS="https://${DOMAIN},https://www.${DOMAIN},http://${DOMAIN},http://www.${DOMAIN},http://31.177.83.107"

echo "==> Backend .env (Steam + extension staging)"
cat >"$APP_DIR/backend/.env" <<EOF
DATABASE_URL="postgresql://cs2:cs2@localhost:5432/cs2_p2p_mvp?schema=public"
PORT=3000
JWT_SECRET="${JWT_SECRET}"
JWT_EXPIRES_IN="7d"
FRONTEND_ORIGIN="${ORIGINS}"

AUTH_PROVIDER=steam
INVENTORY_PROVIDER=steam
TRADE_PROVIDER=mock
ENABLE_MOCK_TRADE=true
ENABLE_MOCK_DEPOSIT=true
ENABLE_TEST_ROUTES=false
PAYMENT_PROVIDER=mock

STEAM_OPENID_REALM=https://${DOMAIN}
API_PUBLIC_URL=https://${DOMAIN}/api/v1
STEAM_WEB_API_KEY=${STEAM_WEB_API_KEY}
ALLOW_MOCK_LOGIN_IN_STEAM_MODE=true
STEAM_HTTP_PROXY=${STEAM_HTTP_PROXY}

INVENTORY_SYNC_TTL_SECONDS=300
INVENTORY_SYNC_MIN_INTERVAL_MS=60000
STEAM_MARKET_PRICE_ENABLED=true
REFERENCE_PRICE_ENABLED=false

# Extension-first (staging QA — rollout gating off so any seller can test)
ENABLE_EXTENSION_CHANNEL=true
ENABLE_EXTENSION_ROLLOUT=false
ENABLE_EXTENSION_TASK_PIPELINE=true
ENABLE_EXTENSION_OFFER_ORCHESTRATOR=true
ENABLE_EXTENSION_TRADE_REFERENCE=true
# API send path: auto-create+send offer; seller only confirms Mobile Guard.
# UI autofill is slower and flaky on Steam Trade Protected inventories.
ENABLE_EXTENSION_UI_TRADE_FLOW=false
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
VITE_ENABLE_MOCK_TRADE=true
VITE_STAGING=true
VITE_QA_MOCK_DEPOSIT=true
VITE_SUPPORT_EMAIL=support@${DOMAIN}
EOF

echo "==> Browser extension build"
cd "$APP_DIR/extension"
npm ci
cd "$APP_DIR/browser-extension"
npm ci
npm run build

echo "==> Frontend: install, build"
cd "$APP_DIR/frontend"
npm ci
npm run build

echo "==> Restart backend"
systemctl restart rip-market-backend
sleep 4

echo "==> Health"
curl -sf "http://127.0.0.1:3000/api/v1/health"
echo ""

echo "==> Extension config"
curl -sf "http://127.0.0.1:3000/api/v1/auth/config" | python3 -m json.tool 2>/dev/null || \
  curl -sf "http://127.0.0.1:3000/api/v1/auth/config"
echo ""

echo "Deploy complete."
echo "  Site:      https://${DOMAIN}"
echo "  Extension: load unpacked browser-extension/dist (ID: ${EXTENSION_ID})"
