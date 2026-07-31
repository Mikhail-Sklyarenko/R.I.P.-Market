#!/usr/bin/env bash
# Daily encrypted-at-rest-by-permissions dumps of both staging databases.
#
# Ledger and wallet data live in these databases: a lost volume without a
# restorable dump means lost client money, so the dump is verified by actually
# restoring it into a throwaway database, not just by checking the exit code.
#
# Usage (on the server, as root):
#   bash scripts/setup-db-backups-staging.sh
#   BACKUP_RETENTION_DAYS=14 bash scripts/setup-db-backups-staging.sh

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/rip-market}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
RUNNER="/usr/local/bin/rip-market-backup"
LOG_FILE="/var/log/rip-market-backup.log"

echo "==> Backup directory $BACKUP_DIR (retention ${RETENTION_DAYS}d)"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

echo "==> Install runner $RUNNER"
cat >"$RUNNER" <<'RUNNER_EOF'
#!/usr/bin/env bash
# Dump every staging database, then prove the newest dump can be restored.
set -uo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/rip-market}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FAILED=0

log() { echo "[$(date -u +%FT%TZ)] $*"; }

dump_db() {
  local container="$1" user="$2" db="$3" label="$4"
  if ! docker inspect "$container" >/dev/null 2>&1; then
    log "SKIP $label — container $container not present"
    return 0
  fi
  local out="$BACKUP_DIR/${label}-${STAMP}.sql.gz"
  if docker exec "$container" pg_dump --clean --if-exists -U "$user" -d "$db" 2>/dev/null | gzip -9 >"$out"; then
    chmod 600 "$out"
    local size
    size="$(stat -c %s "$out")"
    # A valid gzipped dump is never this small; catch silent truncation.
    if [ "$size" -lt 1024 ]; then
      log "FAIL $label — dump suspiciously small (${size}B)"
      FAILED=1
      return 1
    fi
    log "OK   $label — $(numfmt --to=iec "$size") -> $(basename "$out")"
    verify_restore "$container" "$user" "$out" "$label"
  else
    log "FAIL $label — pg_dump failed"
    rm -f "$out"
    FAILED=1
  fi
}

verify_restore() {
  local container="$1" user="$2" archive="$3" label="$4"
  local probe="verify_restore_${STAMP}"
  if ! docker exec "$container" psql -U "$user" -d postgres -q -c "CREATE DATABASE \"$probe\"" >/dev/null 2>&1; then
    log "WARN $label — could not create probe database, restore unverified"
    FAILED=1
    return 1
  fi
  local rc=0
  if ! gzip -dc "$archive" | docker exec -i "$container" psql -U "$user" -d "$probe" -q -v ON_ERROR_STOP=1 >/dev/null 2>&1; then
    rc=1
  fi
  local tables=0
  if [ "$rc" -eq 0 ]; then
    tables="$(docker exec "$container" psql -U "$user" -d "$probe" -tAc \
      "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'" 2>/dev/null || echo 0)"
  fi
  docker exec "$container" psql -U "$user" -d postgres -q -c "DROP DATABASE \"$probe\"" >/dev/null 2>&1 || true
  if [ "$rc" -eq 0 ] && [ "${tables:-0}" -gt 0 ]; then
    log "OK   $label — restore verified ($tables tables)"
  else
    log "FAIL $label — dump is not restorable"
    FAILED=1
  fi
}

log "=== backup run $STAMP ==="
dump_db cs2-p2p-postgres cs2 cs2_p2p_mvp platform
dump_db rip-platform-postgres cs2 cs2_p2p_mvp platform-staging
dump_db rip-crypto-gateway-postgres gateway crypto_gateway gateway

find "$BACKUP_DIR" -name '*.sql.gz' -mtime "+${RETENTION_DAYS}" -delete 2>/dev/null || true
log "retained: $(find "$BACKUP_DIR" -name '*.sql.gz' | wc -l) dumps"

if [ "$FAILED" -ne 0 ]; then
  log "=== backup run FAILED ==="
  exit 1
fi
log "=== backup run OK ==="
RUNNER_EOF
chmod 700 "$RUNNER"

echo "==> Install daily cron (03:30 UTC, before ledger reconcile)"
cat >/etc/cron.d/rip-market-backup <<EOF
# R.I.P. Market — daily database backup with restore verification.
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
BACKUP_DIR=${BACKUP_DIR}
BACKUP_RETENTION_DAYS=${RETENTION_DAYS}
30 3 * * * root ${RUNNER} >>${LOG_FILE} 2>&1
EOF
chmod 644 /etc/cron.d/rip-market-backup

echo "==> First run (this also verifies restore)"
BACKUP_DIR="$BACKUP_DIR" BACKUP_RETENTION_DAYS="$RETENTION_DAYS" "$RUNNER" | tee -a "$LOG_FILE"

echo ""
echo "Backups configured."
echo "  Dumps:  $BACKUP_DIR"
echo "  Log:    $LOG_FILE"
echo "  Manual: $RUNNER"
