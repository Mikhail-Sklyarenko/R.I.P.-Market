#!/usr/bin/env bash
# Install daily ledger + payment reconciliation cron on staging VPS.
#
# Usage (as root on VPS):
#   APP_DIR=/opt/rip-market bash scripts/setup-reconcile-cron.sh

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/rip-market}"
CRON_USER="${CRON_USER:-root}"
LOG_DIR="${LOG_DIR:-/var/log/rip-market}"

mkdir -p "$LOG_DIR"

CRON_LEDGER="0 3 * * * cd ${APP_DIR}/backend && npm run reconcile:ledger >> ${LOG_DIR}/reconcile-ledger.log 2>&1"
CRON_PAYMENTS="0 4 * * * cd ${APP_DIR}/backend && npm run reconcile:payments >> ${LOG_DIR}/reconcile-payments.log 2>&1"

TMP="$(mktemp)"
crontab -u "$CRON_USER" -l 2>/dev/null | grep -v 'reconcile:ledger' | grep -v 'reconcile:payments' >"$TMP" || true
echo "$CRON_LEDGER" >>"$TMP"
echo "$CRON_PAYMENTS" >>"$TMP"
crontab -u "$CRON_USER" "$TMP"
rm -f "$TMP"

echo "Installed cron jobs for $CRON_USER:"
crontab -u "$CRON_USER" -l | grep reconcile
