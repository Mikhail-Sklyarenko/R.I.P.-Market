#!/usr/bin/env bash
# Shared helpers for p2pcs.ru staging rollout scripts.
# shellcheck shell=bash

APP_DIR="${APP_DIR:-/opt/rip-market}"
ENV_PATH="${ENV_PATH:-$APP_DIR/backend/.env}"
DOMAIN="${DOMAIN:-p2pcs.ru}"
GATEWAY_URL="${GATEWAY_URL:-http://127.0.0.1:3001}"
EXTENSION_ID="${VITE_EXTENSION_ID:-gmmlnkjdbcoojbhndjcfehojknjamaoj}"

read_env_value() {
  local key="$1"
  local default="$2"
  if [ -f "$ENV_PATH" ] && grep -q "^${key}=" "$ENV_PATH"; then
    grep "^${key}=" "$ENV_PATH" | head -n1 | cut -d= -f2- | tr -d '"'
  else
    echo "$default"
  fi
}

require_env_or_file() {
  local var_name="$1"
  local file_key="$2"
  local value="${!var_name:-}"
  if [ -z "$value" ]; then
    value="$(read_env_value "$file_key" "")"
  fi
  if [ -z "$value" ]; then
    echo "ERROR: set $var_name or $file_key in $ENV_PATH" >&2
    exit 1
  fi
  printf '%s' "$value"
}

staging_origins() {
  echo "https://${DOMAIN},https://www.${DOMAIN},http://${DOMAIN},http://www.${DOMAIN}"
}

restart_backend() {
  systemctl restart rip-market-backend
  sleep 4
  curl -sf "http://127.0.0.1:3000/api/v1/health"
  echo ""
}

rebuild_frontend() {
  cd "$APP_DIR/frontend"
  npm run build
}

build_browser_extension() {
  cd "$APP_DIR/extension"
  npm ci
  cd "$APP_DIR/browser-extension"
  npm ci
  npm run build
}

write_frontend_env() {
  local mock_trade="${1:-false}"
  cat >"$APP_DIR/frontend/.env" <<EOF
VITE_API_BASE_URL=https://${DOMAIN}/api/v1
VITE_EXTENSION_ID=${EXTENSION_ID}
VITE_ENABLE_MOCK_TRADE=${mock_trade}
VITE_STAGING=true
VITE_QA_MOCK_DEPOSIT=true
VITE_SUPPORT_EMAIL=support@${DOMAIN}
EOF
}
