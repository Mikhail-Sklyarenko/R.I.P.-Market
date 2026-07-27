#!/usr/bin/env bash
# Verify STEAM_HTTP_PROXY is configured and Steam community is reachable via proxy.
#
# Usage:
#   API_BASE=https://p2pcs.ru/api/v1 bash scripts/verify-steam-proxy-staging.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/staging-env.sh
source "$SCRIPT_DIR/lib/staging-env.sh"

API_BASE="${API_BASE:-http://127.0.0.1:3000/api/v1}"
FAIL=0

echo "==> Auth config ($API_BASE)"
CONFIG="$(curl -sf "$API_BASE/auth/config" 2>/dev/null || echo '{}')"
if echo "$CONFIG" | grep -q '"steamHttpProxyConfigured":true'; then
  echo "  OK  steamHttpProxyConfigured"
else
  echo "  FAIL steamHttpProxyConfigured=false" >&2
  echo "  Run: STEAM_HTTP_PROXY='http://...' bash scripts/configure-steam-proxy-staging.sh" >&2
  FAIL=1
fi

echo ""
echo "==> Proxy egress smoke (steamcommunity.com)"
SMOKE_RC=0
(
  cd "$APP_DIR/backend"
  node --env-file="$SECRETS_PATH" --env-file="$ENV_PATH" <<'NODE'
const { ProxyAgent, fetch } = require('undici');

const proxy = process.env.STEAM_HTTP_PROXY?.trim();
if (!proxy) {
  console.error('STEAM_HTTP_PROXY missing in env files');
  process.exit(2);
}

const agent = new ProxyAgent(proxy);
fetch('https://steamcommunity.com/openid/login', {
  method: 'HEAD',
  dispatcher: agent,
  signal: AbortSignal.timeout(15000),
})
  .then((response) => {
    console.log('status', response.status);
    if (response.status === 403 || response.status === 429) {
      process.exit(1);
    }
    process.exit(0);
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
NODE
) || SMOKE_RC=$?

if [ "$SMOKE_RC" -eq 0 ]; then
  echo "  OK  steamcommunity reachable via proxy"
else
  echo "  FAIL proxy smoke test" >&2
  FAIL=1
fi

echo ""
if [ "$FAIL" -eq 0 ]; then
  echo "Steam proxy checks passed."
  exit 0
fi
echo "Steam proxy checks failed." >&2
exit 1
