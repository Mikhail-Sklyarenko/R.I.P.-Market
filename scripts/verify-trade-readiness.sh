#!/usr/bin/env bash
# Preflight for Phase 2+ (Steam trade + extension).
#
# Usage:
#   API_BASE=https://p2pcs.ru/api/v1 bash scripts/verify-trade-readiness.sh
#   API_BASE=... EXPECT_MODE=shadow bash scripts/verify-trade-readiness.sh

set -euo pipefail

API_BASE="${API_BASE:-http://127.0.0.1:3000/api/v1}"
EXPECT_MODE="${EXPECT_MODE:-}" # shadow | live | empty=any steam mode
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

echo "==> Auth / trade config ($API_BASE)"
CONFIG="$(curl -sf "$API_BASE/auth/config" 2>/dev/null || echo '{}')"
echo "$CONFIG" | head -c 700
echo ""

check "Steam auth" echo "$CONFIG" | grep -q '"authProvider":"steam"'
check "Steam inventory" echo "$CONFIG" | grep -q '"inventoryProvider":"steam"'
check "Steam trade provider" echo "$CONFIG" | grep -q '"tradeProvider":"steam"'
check "real settlement off (phase 2)" echo "$CONFIG" | grep -q '"enableRealSettlement":false' || \
  echo "  WARN enableRealSettlement=true (phase 3+)"

MODE="$(echo "$CONFIG" | grep -o '"tradeVerificationMode":"[^"]*"' | cut -d'"' -f4 || true)"
echo "  tradeVerificationMode=${MODE:-unknown}"

if [ -n "$EXPECT_MODE" ]; then
  check "mode is $EXPECT_MODE" [ "$MODE" = "$EXPECT_MODE" ]
fi

check "extension channel" echo "$CONFIG" | grep -q '"extensionChannelEnabled":true'
check "extension task pipeline" echo "$CONFIG" | grep -q '"extensionTaskPipelineEnabled":true'
check "delivery verification engine" echo "$CONFIG" | grep -q '"extension"' # partial

check "crypto payments on" echo "$CONFIG" | grep -q '"cryptoPaymentsEnabled":true'

echo ""
echo "==> Health"
HEALTH="$(curl -sf "$API_BASE/health" 2>/dev/null || echo '{}')"
echo "$HEALTH" | head -c 400
echo ""

check "platform health" curl -sf "$API_BASE/health" >/dev/null

GW="$(echo "$HEALTH" | grep -o '"cryptoGateway":"[^"]*"' | cut -d'"' -f4 || true)"
if [ "$GW" = "ok" ]; then
  echo "  OK  cryptoGateway"
elif [ "$GW" = "disabled" ]; then
  echo "  WARN cryptoGateway disabled"
else
  echo "  FAIL cryptoGateway ($GW)" >&2
  FAIL=1
fi

echo ""
if [ "$FAIL" -eq 0 ]; then
  echo "Trade readiness checks passed."
  exit 0
fi
echo "Some trade checks failed." >&2
exit 1
