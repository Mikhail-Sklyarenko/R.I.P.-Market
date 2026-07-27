#!/usr/bin/env bash
# Configure residential Steam HTTP proxy on staging (DataImpulse or compatible).
# Writes backend/.env.secrets (not overwritten by phase rollout scripts).
#
# Required:
#   STEAM_HTTP_PROXY=http://LOGIN:PASSWORD@gw.dataimpulse.com:823
#
# Usage:
#   STEAM_HTTP_PROXY='http://...' bash scripts/configure-steam-proxy-staging.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/staging-env.sh
source "$SCRIPT_DIR/lib/staging-env.sh"

PROXY_URL="${STEAM_HTTP_PROXY:-$(read_secrets_value STEAM_HTTP_PROXY "")}"
if [ -z "$PROXY_URL" ]; then
  echo "ERROR: set STEAM_HTTP_PROXY (DataImpulse: http://LOGIN:PASSWORD@gw.dataimpulse.com:823)" >&2
  exit 1
fi

PROXY_ALL="${STEAM_HTTP_PROXY_ALL:-true}"

mkdir -p "$(dirname "$SECRETS_PATH")"
umask 077
cat >"$SECRETS_PATH" <<EOF
# Managed by scripts/configure-steam-proxy-staging.sh — do not commit.
STEAM_HTTP_PROXY=${PROXY_URL}
STEAM_HTTP_PROXY_ALL=${PROXY_ALL}
EOF
chmod 600 "$SECRETS_PATH"

strip_env_key() {
  local key="$1"
  local file="$2"
  if [ -f "$file" ]; then
    grep -v "^${key}=" "$file" >"${file}.tmp" || true
    mv "${file}.tmp" "$file"
  fi
}

# Empty keys in backend/.env would override .env.secrets via systemd load order.
strip_env_key STEAM_HTTP_PROXY "$ENV_PATH"
strip_env_key STEAM_HTTP_PROXY_ALL "$ENV_PATH"

UNIT="/etc/systemd/system/rip-market-backend.service"
if [ -f "$UNIT" ]; then
  if ! grep -q "${SECRETS_PATH}" "$UNIT"; then
    sed -i "/EnvironmentFile=${ENV_PATH//\//\\/}/i EnvironmentFile=${SECRETS_PATH}" "$UNIT"
    systemctl daemon-reload
    echo "==> systemd: added EnvironmentFile for .env.secrets"
  fi
fi

echo "==> Restart backend"
restart_backend

echo "==> Verify proxy"
bash "$SCRIPT_DIR/verify-steam-proxy-staging.sh"
