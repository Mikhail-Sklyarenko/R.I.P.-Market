#!/usr/bin/env bash
# Enable NORTH checkout deposits on p2pcs staging (HTTP partner gateway).
# Patches backend/.env in place — does not clobber Steam / JWT / proxy settings.
#
# Required (export before run, or already in backend/.env / .env.secrets):
#   NORTH_GATEWAY_URL
#   NORTH_GATEWAY_API_KEY
#   NORTH_WEBHOOK_SECRET
#
# Optional:
#   APP_DIR (default /opt/rip-market)
#   DOMAIN (default p2pcs.ru)
#   SKIP_MIGRATE=1 — skip prisma migrate deploy
#   SKIP_FRONTEND=1 — skip frontend rebuild
#
# Usage:
#   export NORTH_GATEWAY_URL=http://138.124.24.131:3000
#   export NORTH_GATEWAY_API_KEY=...
#   export NORTH_WEBHOOK_SECRET=...
#   bash scripts/enable-north-payments-staging.sh
#
# After enable, send partner:
#   WEBHOOK_URL=https://p2pcs.ru/api/v1/payments/webhooks/crypto

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/staging-env.sh
source "$SCRIPT_DIR/lib/staging-env.sh"

NORTH_GATEWAY_URL="$(require_env_or_file NORTH_GATEWAY_URL NORTH_GATEWAY_URL)"
NORTH_GATEWAY_API_KEY="$(require_env_or_file NORTH_GATEWAY_API_KEY NORTH_GATEWAY_API_KEY)"
NORTH_WEBHOOK_SECRET="$(require_env_or_file NORTH_WEBHOOK_SECRET NORTH_WEBHOOK_SECRET)"

# Prefer secrets file for API key + webhook secret (not world-readable .env).
upsert_secrets_value NORTH_GATEWAY_API_KEY "$NORTH_GATEWAY_API_KEY"
upsert_secrets_value NORTH_WEBHOOK_SECRET "$NORTH_WEBHOOK_SECRET"
strip_env_key NORTH_GATEWAY_API_KEY
strip_env_key NORTH_WEBHOOK_SECRET

upsert_env_value PAYMENT_PROVIDER north
upsert_env_value ENABLE_MOCK_DEPOSIT false
upsert_env_value NORTH_GATEWAY_URL "$NORTH_GATEWAY_URL"
# Keys live in .env.secrets — empty placeholders must not shadow them.
strip_env_key NORTH_GATEWAY_API_KEY
strip_env_key NORTH_WEBHOOK_SECRET
upsert_env_value MIN_DEPOSIT_MINOR "$(read_env_value MIN_DEPOSIT_MINOR 500)"
upsert_env_value MIN_WITHDRAW_MINOR "$(read_env_value MIN_WITHDRAW_MINOR 2000)"
upsert_env_value WITHDRAW_FEE_MINOR "$(read_env_value WITHDRAW_FEE_MINOR 200)"
upsert_env_value WITHDRAW_MANUAL_REVIEW "$(read_env_value WITHDRAW_MANUAL_REVIEW true)"
upsert_env_value ENABLE_REAL_SETTLEMENT false

ensure_systemd_secrets_env

if [ "${SKIP_MIGRATE:-0}" != "1" ]; then
  echo "==> Prisma migrate deploy"
  cd "$APP_DIR/backend"
  npx prisma migrate deploy
fi

if [ "${SKIP_BACKEND_BUILD:-0}" != "1" ]; then
  echo "==> Backend build (Nest)"
  cd "$APP_DIR/backend"
  npm ci
  npx prisma generate
  npx nest build
fi

if [ "${SKIP_FRONTEND:-0}" != "1" ]; then
  echo "==> Frontend env + rebuild"
  write_frontend_env false
  rebuild_frontend
fi

echo "==> Restart backend"
restart_backend

echo "==> Auth config (expect depositMode=checkout, paymentProvider=north)"
curl -sf "http://127.0.0.1:3000/api/v1/auth/config" | head -c 800
echo ""
echo ""
echo "NORTH Phase 1 enabled."
echo "Partner WEBHOOK_URL=https://${DOMAIN}/api/v1/payments/webhooks/crypto"
echo "Verify: API_BASE=https://${DOMAIN}/api/v1 GATEWAY_URL=${NORTH_GATEWAY_URL} \\"
echo "  EXPECT_PROVIDER=north bash scripts/verify-payments-readiness.sh"
