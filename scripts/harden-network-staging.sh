#!/usr/bin/env bash
# Close the staging VPS network surface down to 22/80/443.
#
# Two independent boundaries are needed:
#   1. ufw — host processes (the Node backend on :3000)
#   2. container port bind addresses — docker inserts its own iptables rules
#      ahead of ufw, so a published 0.0.0.0 port stays reachable even with ufw
#      enabled. Recreating the containers from the updated compose files is what
#      actually closes 5432/5433/3001.
#
# Usage (on the server, as root):
#   bash scripts/harden-network-staging.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/staging-env.sh
source "$SCRIPT_DIR/lib/staging-env.sh"

echo "==> Packages (ufw, fail2ban)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ufw fail2ban >/dev/null

echo "==> ufw rules"
# SSH first — enabling a default-deny policy without it locks us out.
ufw allow 22/tcp comment 'ssh'
ufw allow 80/tcp comment 'http (acme + redirect)'
ufw allow 443/tcp comment 'https'
ufw default deny incoming
ufw default allow outgoing
ufw --force enable
ufw status verbose

echo ""
echo "==> Recreate containers with loopback-only published ports"
if docker inspect cs2-p2p-postgres >/dev/null 2>&1; then
  (cd "$APP_DIR/backend" && docker compose up -d --force-recreate postgres)
fi
if docker inspect rip-crypto-gateway-api >/dev/null 2>&1; then
  GATEWAY_ENV="$APP_DIR/.env.staging"
  if [ -f "$GATEWAY_ENV" ]; then
    (cd "$APP_DIR" && docker compose --env-file "$GATEWAY_ENV" -f docker-compose.staging.yml up -d --force-recreate \
      crypto-gateway-db crypto-gateway-api crypto-gateway-scanner)
  else
    echo "WARN: $GATEWAY_ENV missing — gateway containers left as-is." >&2
    echo "      Re-run scripts/deploy-crypto-gateway-staging.sh to pick up loopback bindings." >&2
  fi
fi

echo ""
echo "==> fail2ban (sshd jail)"
cat >/etc/fail2ban/jail.d/sshd.local <<'EOF'
[sshd]
enabled = true
maxretry = 5
findtime = 10m
bantime = 1h
EOF
systemctl enable --now fail2ban
systemctl restart fail2ban

echo ""
echo "==> Published container ports (must all be 127.0.0.1)"
docker ps --format '{{.Names}}\t{{.Ports}}'

echo ""
echo "==> Host listeners on public interfaces (expect only 22/80/443)"
ss -tlnH | awk '{print $4}' | grep -Ev '^(127\.0\.0\.1|\[::1\])' | sort -u

echo ""
echo "Network hardening done. Verify from outside:"
echo "  for p in 22 80 443 3000 5432 5433 3001; do nc -z -w3 ${DOMAIN} \$p && echo \"\$p OPEN\" || echo \"\$p closed\"; done"
