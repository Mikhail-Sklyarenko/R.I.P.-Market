#!/usr/bin/env bash
# Enable money staging on p2pcs VPS:
#   - mockTrade / mockDeposit OFF
#   - PAYMENT_PROVIDER=crypto_tron → live gateway
#   - ENABLE_REAL_SETTLEMENT=false (Phase 1/2b — deposits + live verify, no auto-settle)
#   - gateway ALLOW_BACKEND_AUTHORIZED_WITHDRAWALS + conservative caps
#
# Prerequisites:
#   - crypto-gateway containers healthy on :3001 (or will be started)
#   - GATEWAY_XPUB set (or generated once into secrets when GENERATE_STAGING_XPUB=1)
#
# Usage (on VPS as root):
#   GENERATE_STAGING_XPUB=1 bash scripts/enable-money-staging.sh
#   # or, if you already have an account-level XPUB:
#   GATEWAY_XPUB='xpub…' bash scripts/enable-money-staging.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/staging-env.sh
source "$SCRIPT_DIR/lib/staging-env.sh"

DOMAIN="${DOMAIN:-p2pcs.ru}"
GATEWAY_URL="${GATEWAY_URL:-http://127.0.0.1:3001}"
COMPOSE_FILE="${COMPOSE_FILE:-$APP_DIR/docker-compose.staging.yml}"
STAGING_ENV_FILE="${STAGING_ENV_FILE:-$APP_DIR/.env.staging}"

# Conservative staging caps (USDT has 6 decimals → 1 USDT = 1_000_000 base units).
MAX_WITHDRAWAL_SUN="${MAX_WITHDRAWAL_SUN:-500000000}"          # 500 USDT
BACKEND_AUTHORIZED_MAX_OPEN="${BACKEND_AUTHORIZED_MAX_OPEN:-5}"
WITHDRAW_DAILY_CAP_MINOR="${WITHDRAW_DAILY_CAP_MINOR:-50000}"  # $500
MIN_DEPOSIT_SUN="${MIN_DEPOSIT_SUN:-5000000}"                  # $5

echo "==> Money staging (mock OFF, crypto_tron ON, real settlement OFF)"

require_steam_http_proxy
ensure_steam_proxy_secret || true

JWT_SECRET="$(read_env_value JWT_SECRET "")"
STEAM_WEB_API_KEY="$(read_env_value STEAM_WEB_API_KEY "")"
if [ -z "$JWT_SECRET" ] || [ -z "$STEAM_WEB_API_KEY" ]; then
  echo "ERROR: JWT_SECRET and STEAM_WEB_API_KEY required in $ENV_PATH" >&2
  exit 1
fi

# Prefer secrets already used by the running gateway container.
read_gateway_container_env() {
  local key="$1"
  docker inspect rip-crypto-gateway-api --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null \
    | awk -F= -v k="$key" '$1==k {print substr($0, index($0,"=")+1); exit}'
}

CRYPTO_GATEWAY_API_KEY="${CRYPTO_GATEWAY_API_KEY:-$(read_secrets_value CRYPTO_GATEWAY_API_KEY "$(read_env_value CRYPTO_GATEWAY_API_KEY "$(read_gateway_container_env API_KEY)")")}"
CRYPTO_GATEWAY_WEBHOOK_SECRET="${CRYPTO_GATEWAY_WEBHOOK_SECRET:-$(read_secrets_value CRYPTO_GATEWAY_WEBHOOK_SECRET "$(read_env_value CRYPTO_GATEWAY_WEBHOOK_SECRET "$(read_gateway_container_env WEBHOOK_SECRET)")")}"
GATEWAY_XPUB="${GATEWAY_XPUB:-$(read_secrets_value GATEWAY_XPUB "$(read_env_value GATEWAY_XPUB "$(read_gateway_container_env XPUB)")")}"
GATEWAY_POSTGRES_PASSWORD="${GATEWAY_POSTGRES_PASSWORD:-$(read_secrets_value GATEWAY_POSTGRES_PASSWORD "")}"
if [ -z "$GATEWAY_POSTGRES_PASSWORD" ]; then
  # Prefer password already used by the running gateway DB URL.
  db_url="$(read_gateway_container_env DATABASE_URL || true)"
  if [[ "$db_url" =~ postgresql://[^:]+:([^@]+)@ ]]; then
    GATEWAY_POSTGRES_PASSWORD="${BASH_REMATCH[1]}"
  else
    GATEWAY_POSTGRES_PASSWORD="gateway"
  fi
fi

if [ -z "$CRYPTO_GATEWAY_API_KEY" ] || [ -z "$CRYPTO_GATEWAY_WEBHOOK_SECRET" ]; then
  echo "ERROR: CRYPTO_GATEWAY_API_KEY / CRYPTO_GATEWAY_WEBHOOK_SECRET missing." >&2
  echo "Export them or ensure rip-crypto-gateway-api is running with those env vars." >&2
  exit 1
fi

is_placeholder_xpub() {
  local x="$1"
  [ -z "$x" ] || [ "$x" = "xpub6..." ] || [[ "$x" == replace-* ]] || [ "${#x}" -lt 20 ]
}

if is_placeholder_xpub "$GATEWAY_XPUB"; then
  if [ "${GENERATE_STAGING_XPUB:-}" = "1" ]; then
    echo "==> Generating staging-only HD wallet (XPUB public; mnemonic → secrets only)"
    cd "$APP_DIR/crypto-gateway"
    if [ ! -d node_modules/@scure/bip39 ]; then
      npm ci --omit=dev
    fi
    gen_out="$(node --input-type=module <<'NODE'
import { generateMnemonic, mnemonicToSeedSync } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { HDKey } from '@scure/bip32';

const mnemonic = generateMnemonic(wordlist, 128);
const seed = mnemonicToSeedSync(mnemonic);
const root = HDKey.fromMasterSeed(seed);
// BIP44 external chain m/44'/195'/0'/0 — deriveChild(index) matches gateway bip44.ts
const external = root.derive("m/44'/195'/0'/0");
if (!external.publicExtendedKey) {
  console.error('Failed to derive external-chain xpub');
  process.exit(1);
}
process.stdout.write(JSON.stringify({
  mnemonic,
  xpub: external.publicExtendedKey,
}));
NODE
)"
    GATEWAY_XPUB="$(printf '%s' "$gen_out" | python3 -c 'import sys,json; print(json.load(sys.stdin)["xpub"])')"
    STAGING_MNEMONIC="$(printf '%s' "$gen_out" | python3 -c 'import sys,json; print(json.load(sys.stdin)["mnemonic"])')"
    upsert_secrets_value GATEWAY_XPUB "$GATEWAY_XPUB"
    upsert_secrets_value GATEWAY_STAGING_MNEMONIC "$STAGING_MNEMONIC"
    echo "    Stored GATEWAY_XPUB + GATEWAY_STAGING_MNEMONIC in $SECRETS_PATH (chmod 600)."
    echo "    WARNING: staging wallet only — do not reuse for production cold storage."
  else
    echo "ERROR: GATEWAY_XPUB is missing/placeholder (len=${#GATEWAY_XPUB})." >&2
    echo "Set GATEWAY_XPUB=… or re-run with GENERATE_STAGING_XPUB=1" >&2
    exit 1
  fi
fi

upsert_secrets_value CRYPTO_GATEWAY_API_KEY "$CRYPTO_GATEWAY_API_KEY"
upsert_secrets_value CRYPTO_GATEWAY_WEBHOOK_SECRET "$CRYPTO_GATEWAY_WEBHOOK_SECRET"
upsert_secrets_value GATEWAY_XPUB "$GATEWAY_XPUB"
upsert_secrets_value GATEWAY_POSTGRES_PASSWORD "$GATEWAY_POSTGRES_PASSWORD"

echo "==> Write $STAGING_ENV_FILE for docker compose"
umask 077
cat >"$STAGING_ENV_FILE" <<EOF
CRYPTO_GATEWAY_API_KEY=${CRYPTO_GATEWAY_API_KEY}
CRYPTO_GATEWAY_WEBHOOK_SECRET=${CRYPTO_GATEWAY_WEBHOOK_SECRET}
GATEWAY_POSTGRES_PASSWORD=${GATEWAY_POSTGRES_PASSWORD}
GATEWAY_XPUB=${GATEWAY_XPUB}
PLATFORM_WEBHOOK_URL=https://${DOMAIN}/api/v1/payments/webhooks/crypto
USDT_CONTRACT=TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
MIN_CONFIRMATIONS=19
MIN_DEPOSIT_SUN=${MIN_DEPOSIT_SUN}
TRON_GRID_API_KEY=${TRON_GRID_API_KEY:-}
TRON_GRID_BASE_URL=https://api.trongrid.io
ALLOW_BACKEND_AUTHORIZED_WITHDRAWALS=true
MAX_WITHDRAWAL_SUN=${MAX_WITHDRAWAL_SUN}
BACKEND_AUTHORIZED_MAX_OPEN=${BACKEND_AUTHORIZED_MAX_OPEN}
EOF
chmod 600 "$STAGING_ENV_FILE"

echo "==> Rebuild / restart crypto-gateway (api + scanner, no signer)"
cd "$APP_DIR"
git pull --ff-only || true
docker compose --env-file "$STAGING_ENV_FILE" -f "$COMPOSE_FILE" build crypto-gateway-api
docker compose --env-file "$STAGING_ENV_FILE" -f "$COMPOSE_FILE" up -d \
  crypto-gateway-db crypto-gateway-api crypto-gateway-scanner

echo "==> Wait for gateway health"
for i in $(seq 1 40); do
  if curl -sf "$GATEWAY_URL/v1/health" >/dev/null 2>&1; then
    echo "Gateway healthy"
    break
  fi
  if [ "$i" -eq 40 ]; then
    echo "ERROR: gateway did not become healthy" >&2
    docker logs rip-crypto-gateway-api --tail 80 >&2 || true
    exit 1
  fi
  sleep 2
done

# Confirm authorized-withdrawals flags landed
gw_allow="$(read_gateway_container_env ALLOW_BACKEND_AUTHORIZED_WITHDRAWALS || true)"
gw_max="$(read_gateway_container_env MAX_WITHDRAWAL_SUN || true)"
gw_open="$(read_gateway_container_env BACKEND_AUTHORIZED_MAX_OPEN || true)"
echo "    ALLOW_BACKEND_AUTHORIZED_WITHDRAWALS=${gw_allow:-unset}"
echo "    MAX_WITHDRAWAL_SUN=${gw_max:-unset}"
echo "    BACKEND_AUTHORIZED_MAX_OPEN=${gw_open:-unset}"

ORIGINS="https://${DOMAIN},https://www.${DOMAIN},http://${DOMAIN},http://www.${DOMAIN},http://31.177.83.107"
OWNER_ADMIN_STEAM_IDS="$(read_env_value OWNER_ADMIN_STEAM_IDS 76561198195181115)"

echo "==> Backend .env (money mode)"
cat >"$ENV_PATH" <<EOF
DATABASE_URL="postgresql://cs2:cs2@localhost:5432/cs2_p2p_mvp?schema=public"
PORT=3000
HOST=127.0.0.1
JWT_SECRET="${JWT_SECRET}"
JWT_EXPIRES_IN="7d"
FRONTEND_ORIGIN="${ORIGINS}"
PUBLIC_SITE_URL="https://${DOMAIN}"

AUTH_PROVIDER=steam
INVENTORY_PROVIDER=steam
TRADE_PROVIDER=mock
ENABLE_MOCK_TRADE=false
ENABLE_MOCK_DEPOSIT=false
ENABLE_TEST_ROUTES=false
ALLOW_MOCK_LOGIN_IN_STEAM_MODE=true

STEAM_OPENID_REALM=https://${DOMAIN}
API_PUBLIC_URL=https://${DOMAIN}/api/v1
STEAM_WEB_API_KEY=${STEAM_WEB_API_KEY}

INVENTORY_SYNC_TTL_SECONDS=300
INVENTORY_SYNC_MIN_INTERVAL_MS=60000
STEAM_MARKET_PRICE_ENABLED=true
REFERENCE_PRICE_ENABLED=false
OWNER_ADMIN_STEAM_IDS=${OWNER_ADMIN_STEAM_IDS}
STEAM_PRICE_FALLBACK_ENABLED=false
STEAM_CATALOG_PRICE_GAP_MS=150
CATALOG_PRICE_BULK_REFRESH_ENABLED=true

# Live Steam trade verification; ledger settlement still off until Phase 3
TRADE_VERIFICATION_MODE=live
ENABLE_REAL_SETTLEMENT=false
TRADE_TIMEOUT_MINUTES=60

# Money — USDT TRC-20 deposits via crypto-gateway
PAYMENT_PROVIDER=crypto_tron
CRYPTO_GATEWAY_URL=${GATEWAY_URL}
CRYPTO_GATEWAY_API_KEY=${CRYPTO_GATEWAY_API_KEY}
CRYPTO_GATEWAY_WEBHOOK_SECRET=${CRYPTO_GATEWAY_WEBHOOK_SECRET}
MIN_DEPOSIT_MINOR=500
MIN_WITHDRAW_MINOR=2000
WITHDRAW_FEE_MINOR=200
WITHDRAW_MANUAL_REVIEW=true
WITHDRAW_MANUAL_REVIEW_COUNT=3
WITHDRAW_REQUIRE_STEAM_LINKED=true
WITHDRAW_DAILY_CAP_MINOR=${WITHDRAW_DAILY_CAP_MINOR}
WITHDRAW_MIN_COMPLETED_SALES=0

# Extension-first (staging)
ENABLE_EXTENSION_CHANNEL=true
ENABLE_EXTENSION_ROLLOUT=false
ENABLE_EXTENSION_TASK_PIPELINE=true
ENABLE_EXTENSION_OFFER_ORCHESTRATOR=true
ENABLE_EXTENSION_TRADE_REFERENCE=true
ENABLE_EXTENSION_UI_TRADE_FLOW=true
ENABLE_EXTENSION_TRADE_ACKNOWLEDGMENT=true
ENABLE_TRADE_REFERENCE_RECONCILE=true
ENABLE_EXTENSION_FIRST_TRADE_FLOW=false
ENABLE_DELIVERY_VERIFICATION_ENGINE=true
ENABLE_SETTLEMENT_HOLD_WINDOW=false
ENABLE_EXTENSION_DISPUTE_BRIDGE=false
ENABLE_EXTENSION_FLOW_OBSERVABILITY=false
EOF
chmod 600 "$ENV_PATH"

echo "==> Frontend .env (mocks off)"
cat >"$APP_DIR/frontend/.env" <<EOF
VITE_API_BASE_URL=https://${DOMAIN}/api/v1
VITE_EXTENSION_ID=${EXTENSION_ID}
VITE_ENABLE_MOCK_TRADE=false
VITE_STAGING=true
VITE_QA_MOCK_DEPOSIT=false
VITE_SUPPORT_EMAIL=support@${DOMAIN}
EOF

echo "==> Backend build + restart"
cd "$APP_DIR/backend"
npm ci
npx prisma generate
npx prisma migrate deploy
npm run build
restart_backend

echo "==> Frontend rebuild"
cd "$APP_DIR/frontend"
npm ci
rebuild_frontend

echo "==> Verify"
API_BASE="http://127.0.0.1:3000/api/v1" GATEWAY_URL="$GATEWAY_URL" EXPECT_PROVIDER=crypto_tron \
  bash "$SCRIPT_DIR/verify-payments-readiness.sh"

echo ""
echo "Money staging enabled."
echo "  mockTrade/mockDeposit: OFF"
echo "  paymentProvider: crypto_tron"
echo "  enableRealSettlement: false (Phase 3 still gated)"
echo "  gateway authorized withdrawals: ON (cap ${MAX_WITHDRAWAL_SUN} base units, max open ${BACKEND_AUTHORIZED_MAX_OPEN})"
echo "  signer: NOT started (withdrawals stay manual-review / no auto on-chain payout)"
echo ""
echo "Next: invite-only deposit smoke → docs/REAL-MONEY-ROLLOUT.md Phase 1"
echo "Do NOT run enable-phase3-settlement until deposit+verify gates pass."
