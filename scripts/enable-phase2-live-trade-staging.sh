#!/usr/bin/env bash
# Phase 2b — promote to LIVE trade verification without real settlement.
# Run after shadow period (5+ successful trade checks, 0 mismatches).
#
# Usage:
#   bash scripts/enable-phase2-live-trade-staging.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/staging-env.sh
source "$SCRIPT_DIR/lib/staging-env.sh"

if [ ! -f "$ENV_PATH" ]; then
  echo "ERROR: $ENV_PATH not found — run enable-phase2-shadow-trade-staging.sh first" >&2
  exit 1
fi

tmp="$(mktemp)"
grep -v '^TRADE_VERIFICATION_MODE=' "$ENV_PATH" | \
  grep -v '^ENABLE_MOCK_TRADE=' | \
  grep -v '^VITE_ENABLE_MOCK_TRADE=' >"$tmp" || true
mv "$tmp" "$ENV_PATH"

{
  echo "TRADE_VERIFICATION_MODE=live"
  echo "ENABLE_MOCK_TRADE=false"
} >>"$ENV_PATH"

write_frontend_env false
rebuild_frontend

echo "==> Restart backend"
restart_backend

echo "==> Auth config"
curl -sf "http://127.0.0.1:3000/api/v1/auth/config" | head -c 800
echo ""
echo ""
echo "Phase 2b (live trade, no settlement) enabled."
echo "Orders complete via Steam poll/extension — mock trade disabled for users."
echo "Next: allowlist → bash scripts/enable-phase3-settlement-staging.sh"
