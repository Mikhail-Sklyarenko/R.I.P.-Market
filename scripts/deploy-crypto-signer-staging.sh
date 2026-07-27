#!/usr/bin/env bash
# Phase 4 — start crypto-gateway signer for on-chain withdrawals.
# Requires GATEWAY_MNEMONIC + GATEWAY_HOT_WALLET_ADDRESS in .env.staging.
#
# Usage:
#   bash scripts/deploy-crypto-signer-staging.sh

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/rip-market}"
ENV_FILE="${ENV_FILE:-$APP_DIR/.env.staging}"
COMPOSE_FILE="${COMPOSE_FILE:-$APP_DIR/docker-compose.staging.yml}"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE" >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a

if [ -z "${GATEWAY_MNEMONIC:-}" ] || [ -z "${GATEWAY_HOT_WALLET_ADDRESS:-}" ]; then
  echo "ERROR: set GATEWAY_MNEMONIC and GATEWAY_HOT_WALLET_ADDRESS in $ENV_FILE" >&2
  exit 1
fi

cd "$APP_DIR"

echo "==> Start signer (prod profile)"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" --profile prod up -d crypto-gateway-signer

echo "==> Signer logs (last 20 lines)"
sleep 3
docker logs --tail 20 rip-crypto-gateway-signer 2>/dev/null || true

echo ""
echo "Phase 4 signer started. Withdrawals still require admin approve (WITHDRAW_MANUAL_REVIEW=true)."
