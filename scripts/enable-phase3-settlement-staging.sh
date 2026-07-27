#!/usr/bin/env bash
# Phase 3 — real settlement for allowlisted Steam IDs (buyer AND seller).
#
# Required:
#   STEAM_SETTLEMENT_ALLOWLIST_STEAM_IDS=76561198...,76561198...
#
# Optional limits (defaults are conservative):
#   STEAM_SETTLEMENT_MAX_ORDER_MINOR=5000
#   STEAM_SETTLEMENT_MAX_DAILY_ORDERS=3
#   STEAM_SETTLEMENT_MAX_DAILY_VOLUME_MINOR=15000
#
# Usage:
#   export STEAM_SETTLEMENT_ALLOWLIST_STEAM_IDS=76561198...,76561198...
#   bash scripts/enable-phase3-settlement-staging.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/staging-env.sh
source "$SCRIPT_DIR/lib/staging-env.sh"

ALLOWLIST="${STEAM_SETTLEMENT_ALLOWLIST_STEAM_IDS:-$(read_env_value STEAM_SETTLEMENT_ALLOWLIST_STEAM_IDS "")}"
if [ -z "$ALLOWLIST" ]; then
  echo "ERROR: set STEAM_SETTLEMENT_ALLOWLIST_STEAM_IDS (comma-separated buyer+seller steam ids)" >&2
  exit 1
fi

MAX_ORDER="${STEAM_SETTLEMENT_MAX_ORDER_MINOR:-5000}"
MAX_DAILY_ORDERS="${STEAM_SETTLEMENT_MAX_DAILY_ORDERS:-3}"
MAX_DAILY_VOLUME="${STEAM_SETTLEMENT_MAX_DAILY_VOLUME_MINOR:-15000}"

if [ ! -f "$ENV_PATH" ]; then
  echo "ERROR: $ENV_PATH not found — run phase 2 scripts first" >&2
  exit 1
fi

tmp="$(mktemp)"
grep -v '^TRADE_VERIFICATION_MODE=' "$ENV_PATH" | \
  grep -v '^ENABLE_REAL_SETTLEMENT=' | \
  grep -v '^ENABLE_SETTLEMENT_HOLD_WINDOW=' | \
  grep -v '^ENABLE_EXTENSION_DISPUTE_BRIDGE=' | \
  grep -v '^STEAM_SETTLEMENT_ALLOWLIST_STEAM_IDS=' | \
  grep -v '^STEAM_SETTLEMENT_MAX_ORDER_MINOR=' | \
  grep -v '^STEAM_SETTLEMENT_MAX_DAILY_ORDERS=' | \
  grep -v '^STEAM_SETTLEMENT_MAX_DAILY_VOLUME_MINOR=' >"$tmp" || true
mv "$tmp" "$ENV_PATH"

{
  echo "TRADE_VERIFICATION_MODE=live"
  echo "ENABLE_REAL_SETTLEMENT=true"
  echo "ENABLE_SETTLEMENT_HOLD_WINDOW=true"
  echo "ENABLE_EXTENSION_DISPUTE_BRIDGE=true"
  echo "STEAM_SETTLEMENT_ALLOWLIST_STEAM_IDS=${ALLOWLIST}"
  echo "STEAM_SETTLEMENT_MAX_ORDER_MINOR=${MAX_ORDER}"
  echo "STEAM_SETTLEMENT_MAX_DAILY_ORDERS=${MAX_DAILY_ORDERS}"
  echo "STEAM_SETTLEMENT_MAX_DAILY_VOLUME_MINOR=${MAX_DAILY_VOLUME}"
} >>"$ENV_PATH"

write_frontend_env false
rebuild_frontend

echo "==> Restart backend"
restart_backend

echo "==> Auth config"
curl -sf "http://127.0.0.1:3000/api/v1/auth/config" | head -c 800
echo ""
echo ""
echo "Phase 3 (real settlement) enabled for allowlist:"
echo "  ${ALLOWLIST}"
echo "Limits: order=\$$(awk "BEGIN {printf \"%.2f\", ${MAX_ORDER}/100}") daily_orders=${MAX_DAILY_ORDERS}"
echo "Next: bash scripts/deploy-crypto-signer-staging.sh for withdrawals (Phase 4)"
