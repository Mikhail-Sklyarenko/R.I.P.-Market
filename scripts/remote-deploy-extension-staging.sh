#!/usr/bin/env bash
# Run deploy-extension-staging.sh on the staging VPS over SSH.
# Usage: STAGING_HOST=root@31.177.83.107 bash scripts/remote-deploy-extension-staging.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAGING_HOST="${STAGING_HOST:-root@31.177.83.107}"

echo "==> SSH deploy to ${STAGING_HOST}"
ssh -o StrictHostKeyChecking=accept-new "$STAGING_HOST" \
  "bash -s" < "$REPO_ROOT/scripts/deploy-extension-staging.sh"

echo "==> Public health check"
curl -sf "https://p2pcs.ru/api/v1/health"
echo ""
curl -sf "https://p2pcs.ru/api/v1/auth/config" | python3 -m json.tool 2>/dev/null | head -40 || true
