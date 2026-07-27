#!/usr/bin/env bash
# Emergency rollback — mock trade providers (Gate 4 drill).
# Preserves crypto payments and Steam auth if already configured.
#
# Usage:
#   bash scripts/rollback-to-mock-trade-staging.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/staging-env.sh
source "$SCRIPT_DIR/lib/staging-env.sh"

if [ ! -f "$ENV_PATH" ]; then
  echo "ERROR: $ENV_PATH not found" >&2
  exit 1
fi

tmp="$(mktemp)"
grep -v '^TRADE_PROVIDER=' "$ENV_PATH" | \
  grep -v '^TRADE_VERIFICATION_MODE=' "$ENV_PATH" | \
  grep -v '^ENABLE_REAL_SETTLEMENT=' "$ENV_PATH" | \
  grep -v '^ENABLE_MOCK_TRADE=' "$ENV_PATH" | \
  grep -v '^ENABLE_SETTLEMENT_HOLD_WINDOW=' "$ENV_PATH" | \
  grep -v '^EXTENSION_ROLLOUT_KILL_SWITCH=' "$ENV_PATH" >"$tmp" || true
mv "$tmp" "$ENV_PATH"

{
  echo "TRADE_PROVIDER=mock"
  echo "TRADE_VERIFICATION_MODE=off"
  echo "ENABLE_REAL_SETTLEMENT=false"
  echo "ENABLE_MOCK_TRADE=true"
  echo "ENABLE_SETTLEMENT_HOLD_WINDOW=false"
  echo "EXTENSION_ROLLOUT_KILL_SWITCH=true"
} >>"$ENV_PATH"

write_frontend_env true
rebuild_frontend

echo "==> Restart backend"
restart_backend

echo "Rollback complete. Mock trade active; extension kill switch on."
echo "Run smoke: login → buy → mock complete → COMPLETED"
