#!/usr/bin/env bash
# Shared helpers for p2pcs.ru staging rollout scripts.
# shellcheck shell=bash

APP_DIR="${APP_DIR:-/opt/rip-market}"
ENV_PATH="${ENV_PATH:-$APP_DIR/backend/.env}"
SECRETS_PATH="${SECRETS_PATH:-$APP_DIR/backend/.env.secrets}"
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

read_secrets_value() {
  local key="$1"
  local default="$2"
  if [ -f "$SECRETS_PATH" ] && grep -q "^${key}=" "$SECRETS_PATH"; then
    grep "^${key}=" "$SECRETS_PATH" | head -n1 | cut -d= -f2- | tr -d '"'
  else
    echo "$default"
  fi
}

read_steam_http_proxy() {
  local from_env="${STEAM_HTTP_PROXY:-}"
  if [ -n "$from_env" ]; then
    printf '%s' "$from_env"
    return
  fi
  local from_secrets
  from_secrets="$(read_secrets_value STEAM_HTTP_PROXY "")"
  if [ -n "$from_secrets" ]; then
    printf '%s' "$from_secrets"
    return
  fi
  read_env_value STEAM_HTTP_PROXY ""
}

require_steam_http_proxy() {
  local proxy
  proxy="$(read_steam_http_proxy)"
  if [ -z "$proxy" ]; then
    echo "ERROR: STEAM_HTTP_PROXY is required for Steam on staging VPS." >&2
    echo "Set in $SECRETS_PATH or run:" >&2
    echo "  STEAM_HTTP_PROXY='http://LOGIN:PASSWORD@gw.dataimpulse.com:823' bash scripts/configure-steam-proxy-staging.sh" >&2
    exit 1
  fi
}

ensure_systemd_secrets_env() {
  local unit="/etc/systemd/system/rip-market-backend.service"
  if [ ! -f "$unit" ]; then
    return 0
  fi
  if grep -q "${SECRETS_PATH}" "$unit"; then
    return 0
  fi
  sed -i "/EnvironmentFile=${ENV_PATH//\//\\/}/i EnvironmentFile=${SECRETS_PATH}" "$unit"
  systemctl daemon-reload
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
  ensure_systemd_secrets_env
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
