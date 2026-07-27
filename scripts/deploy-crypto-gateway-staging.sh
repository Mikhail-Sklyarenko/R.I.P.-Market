#!/usr/bin/env bash
# Deploy crypto-gateway stack on staging VPS (api + scanner + DB).
# Signer is NOT started — deposits only (Phase 1).
#
# Prerequisites:
#   - Docker + docker compose on the host
#   - Repo at APP_DIR with docker-compose.staging.yml
#   - .env.staging at repo root (see .env.staging.example)
#
# Usage:
#   cp .env.staging.example .env.staging   # fill secrets once
#   bash scripts/deploy-crypto-gateway-staging.sh

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/rip-market}"
ENV_FILE="${ENV_FILE:-$APP_DIR/.env.staging}"
COMPOSE_FILE="${COMPOSE_FILE:-$APP_DIR/docker-compose.staging.yml}"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE — copy from .env.staging.example and fill secrets." >&2
  exit 1
fi

if [ ! -f "$COMPOSE_FILE" ]; then
  echo "Missing $COMPOSE_FILE" >&2
  exit 1
fi

cd "$APP_DIR"

echo "==> Build crypto-gateway image"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" build crypto-gateway-api

echo "==> Start gateway DB + API + scanner (no signer)"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d \
  crypto-gateway-db crypto-gateway-api crypto-gateway-scanner

echo "==> Wait for gateway health"
for i in $(seq 1 30); do
  if curl -sf http://127.0.0.1:3001/v1/health >/dev/null 2>&1; then
    echo "Gateway healthy"
    curl -s http://127.0.0.1:3001/v1/health
    echo ""
    exit 0
  fi
  sleep 2
done

echo "Gateway did not become healthy in time. Check: docker logs rip-crypto-gateway-api" >&2
exit 1
