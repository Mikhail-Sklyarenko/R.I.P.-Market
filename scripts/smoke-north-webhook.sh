#!/usr/bin/env bash
# Local/ops smoke: sign and POST a deposit.credited webhook to the platform.
# Does NOT talk to NORTH — only verifies your webhook + ledger path.
#
# Required:
#   USER_ID — platform user UUID (externalUserId)
#   NORTH_WEBHOOK_SECRET or CRYPTO_GATEWAY_WEBHOOK_SECRET
#
# Optional:
#   API_BASE (default https://p2pcs.ru/api/v1)
#   CREDIT_USD (default 10)
#   TX_HASH / EVENT_ID / EXTERNAL_ID / PAYMENT_METHOD
#
# Usage:
#   USER_ID=... NORTH_WEBHOOK_SECRET=... bash scripts/smoke-north-webhook.sh
#   # re-run same EVENT_ID + TX_HASH to confirm idempotency (balance must not double)

set -euo pipefail

API_BASE="${API_BASE:-https://p2pcs.ru/api/v1}"
USER_ID="${USER_ID:?set USER_ID (platform user UUID)}"
SECRET="${NORTH_WEBHOOK_SECRET:-${CRYPTO_GATEWAY_WEBHOOK_SECRET:-}}"
if [ -z "$SECRET" ]; then
  echo "ERROR: set NORTH_WEBHOOK_SECRET (or CRYPTO_GATEWAY_WEBHOOK_SECRET)" >&2
  exit 1
fi

CREDIT_USD="${CREDIT_USD:-10}"
TS="$(date +%s)"
TX_HASH="${TX_HASH:-smoke-tx-${TS}}"
EVENT_ID="${EVENT_ID:-smoke-evt-${TS}}"
EXTERNAL_ID="${EXTERNAL_ID:-dep_smoke_${TS}}"
PAYMENT_METHOD="${PAYMENT_METHOD:-trc20}"

BODY="$(USER_ID="$USER_ID" CREDIT_USD="$CREDIT_USD" EVENT_ID="$EVENT_ID" \
  EXTERNAL_ID="$EXTERNAL_ID" TX_HASH="$TX_HASH" PAYMENT_METHOD="$PAYMENT_METHOD" TS="$TS" \
  python3 - <<'PY'
import json, os
from datetime import datetime, timezone
print(json.dumps({
  "eventId": os.environ["EVENT_ID"],
  "type": "deposit.credited",
  "externalUserId": os.environ["USER_ID"],
  "externalId": os.environ["EXTERNAL_ID"],
  "invoiceId": f"inv_smoke_{os.environ['TS']}",
  "txHash": os.environ["TX_HASH"],
  "creditUsd": os.environ["CREDIT_USD"],
  "amountUsdt": os.environ["CREDIT_USD"],
  "amountSun": "0",
  "paymentMethod": os.environ["PAYMENT_METHOD"],
  "network": os.environ["PAYMENT_METHOD"],
  "address": "TSmokeNorthAddressForWebhookTestOnly1",
  "creditedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
}, separators=(",", ":")))
PY
)"

SIG="$(SECRET="$SECRET" BODY="$BODY" python3 - <<'PY'
import hmac, hashlib, os
secret = os.environ["SECRET"]
body = os.environ["BODY"].encode("utf-8")
print(hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest())
PY
)"

echo "==> POST $API_BASE/payments/webhooks/crypto"
echo "    eventId=$EVENT_ID creditUsd=$CREDIT_USD user=$USER_ID"
HTTP_CODE="$(curl -s -o /tmp/north-smoke-webhook.json -w '%{http_code}' \
  -X POST "$API_BASE/payments/webhooks/crypto" \
  -H "Content-Type: application/json" \
  -H "X-Gateway-Signature: $SIG" \
  -d "$BODY")"

echo "    HTTP $HTTP_CODE"
cat /tmp/north-smoke-webhook.json
echo ""

if [ "$HTTP_CODE" != "200" ] && [ "$HTTP_CODE" != "201" ]; then
  echo "FAIL: expected 200" >&2
  exit 1
fi

echo "OK. Re-run with same EVENT_ID=$EVENT_ID TX_HASH=$TX_HASH to verify idempotency."
