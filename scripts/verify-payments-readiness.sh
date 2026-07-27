#!/usr/bin/env bash
# Preflight checks before enabling real USDT deposits (Phase 0/1).
#
# Usage:
#   API_BASE=https://p2pcs.ru/api/v1 bash scripts/verify-payments-readiness.sh
#   GATEWAY_URL=http://127.0.0.1:3001 bash scripts/verify-payments-readiness.sh

set -euo pipefail

API_BASE="${API_BASE:-http://127.0.0.1:3000/api/v1}"
GATEWAY_URL="${GATEWAY_URL:-http://127.0.0.1:3001}"
FAIL=0

check() {
  local name="$1"
  shift
  if "$@"; then
    echo "  OK  $name"
  else
    echo "  FAIL $name" >&2
    FAIL=1
  fi
}

echo "==> Platform health ($API_BASE)"
HEALTH="$(curl -sf "$API_BASE/health" 2>/dev/null || echo '{}')"
echo "$HEALTH" | head -c 500
echo ""

check "platform /health responds" curl -sf "$API_BASE/health" >/dev/null

DB_STATUS="$(echo "$HEALTH" | grep -o '"database":"[^"]*"' | cut -d'"' -f4 || true)"
if [ "$DB_STATUS" = "ok" ]; then
  echo "  OK  database"
else
  echo "  FAIL database ($DB_STATUS)" >&2
  FAIL=1
fi

CRYPTO_GW="$(echo "$HEALTH" | grep -o '"cryptoGateway":"[^"]*"' | cut -d'"' -f4 || true)"
case "$CRYPTO_GW" in
  ok) echo "  OK  cryptoGateway connected" ;;
  disabled) echo "  WARN cryptoGateway disabled (PAYMENT_PROVIDER=mock?)" ;;
  unavailable|"") echo "  FAIL cryptoGateway unavailable" >&2; FAIL=1 ;;
esac

echo ""
echo "==> Auth / payments config"
CONFIG="$(curl -sf "$API_BASE/auth/config" 2>/dev/null || echo '{}')"
echo "$CONFIG" | head -c 600
echo ""

check "cryptoPaymentsEnabled" echo "$CONFIG" | grep -q '"cryptoPaymentsEnabled":true'
check "mockDepositEnabled off" echo "$CONFIG" | grep -q '"mockDepositEnabled":false'
check "real settlement off (Phase 1)" echo "$CONFIG" | grep -q '"enableRealSettlement":false'

echo ""
echo "==> Gateway health ($GATEWAY_URL)"
if curl -sf "$GATEWAY_URL/v1/health" >/dev/null 2>&1; then
  echo "  OK  gateway /v1/health"
  curl -s "$GATEWAY_URL/v1/health"
  echo ""
else
  echo "  FAIL gateway /v1/health" >&2
  FAIL=1
fi

echo ""
echo "==> Webhook route reachable (expect 401/403 without signature)"
WEBHOOK_CODE="$(curl -s -o /dev/null -w '%{http_code}' \
  -X POST "$API_BASE/payments/webhooks/crypto" \
  -H 'Content-Type: application/json' \
  -d '{}' || true)"
if [ "$WEBHOOK_CODE" = "401" ] || [ "$WEBHOOK_CODE" = "403" ] || [ "$WEBHOOK_CODE" = "400" ]; then
  echo "  OK  webhook endpoint responds ($WEBHOOK_CODE)"
else
  echo "  FAIL webhook endpoint ($WEBHOOK_CODE)" >&2
  FAIL=1
fi

echo ""
if [ "$FAIL" -eq 0 ]; then
  echo "All checks passed. Safe to run invite-only USDT deposit tests."
  exit 0
fi

echo "Some checks failed. Fix before inviting real deposits." >&2
exit 1
