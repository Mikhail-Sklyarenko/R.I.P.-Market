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

export STEAM_HTTP_PROXY="$PROXY_URL"
export STEAM_HTTP_PROXY_ALL="${STEAM_HTTP_PROXY_ALL:-true}"

# Writes .env.secrets, drops the keys from .env (systemd loads .env last) and
# makes sure the unit reads the secrets file.
ensure_steam_proxy_secret

echo "==> Restart backend"
restart_backend

echo "==> Verify proxy"
bash "$SCRIPT_DIR/verify-steam-proxy-staging.sh"
