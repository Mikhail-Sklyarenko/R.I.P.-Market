# NORTH checkout payments

HTTP-only integration with the partner **NORTH** gateway (no gateway repo in this codebase).

## Flow

1. User chooses amount + network (`trc20` | `bep20` | `erc20`) on **Wallet → Deposit**.
2. Platform `POST /api/v1/wallet/deposit/checkout` → NORTH `POST /v1/checkout`.
3. Browser redirects to `checkoutUrl` (NORTH `/pay` page).
4. User returns to `/wallet?tab=deposit&fromCheckout=1` (faster poll until credit).
5. NORTH posts `deposit.credited` to `POST /api/v1/payments/webhooks/crypto`.
6. Platform verifies `X-Gateway-Signature` (HMAC-SHA256 of **raw** body) and credits **`creditUsd`** to the ledger (idempotent on `eventId` + `txHash`).

Do **not** credit on checkout create.

## Env (platform)

```env
PAYMENT_PROVIDER=north
ENABLE_MOCK_DEPOSIT=false
NORTH_GATEWAY_URL=https://north-host:3000
NORTH_GATEWAY_API_KEY=…
NORTH_WEBHOOK_SECRET=…
```

Partner gateway must have:

```env
WEBHOOK_URL=https://p2pcs.ru/api/v1/payments/webhooks/crypto
```

## Staging cutover

```bash
export NORTH_GATEWAY_URL='http://…:3000'
export NORTH_GATEWAY_API_KEY='…'
export NORTH_WEBHOOK_SECRET='…'
bash scripts/enable-north-payments-staging.sh

API_BASE=https://p2pcs.ru/api/v1 \
  GATEWAY_URL="$NORTH_GATEWAY_URL" \
  EXPECT_PROVIDER=north \
  bash scripts/verify-payments-readiness.sh
```

Webhook-only ledger smoke (no on-chain payment):

```bash
USER_ID=<uuid> NORTH_WEBHOOK_SECRET=… \
  bash scripts/smoke-north-webhook.sh
# re-run with same EVENT_ID + TX_HASH → balance must not double
```

## Message to partner (after verify passes)

```text
Webhook URL: https://p2pcs.ru/api/v1/payments/webhooks/crypto
externalUserId: <platform user UUID>
Smoke: amountUsd "10", paymentMethod trc20
Endpoint: 200 + idempotency by eventId/txHash — confirmed
Ready for joint test: checkout → pay → webhook → ledger creditUsd
```

## Cutover from crypto_tron

| | `crypto_tron` | `north` |
|--|---------------|---------|
| Deposit UX | Permanent address + QR | Amount + network → redirect |
| Credit source | `amountSun` → USD 1:1 | `creditUsd` |
| Env prefix | `CRYPTO_GATEWAY_*` | `NORTH_*` |
| Enable script | `enable-crypto-payments-staging.sh` | `enable-north-payments-staging.sh` |

Kill switch: `PAYMENT_PROVIDER=mock` (+ optional `ENABLE_MOCK_DEPOSIT=true`).

## Gate «готово»

- [ ] `/auth/config` → `paymentProvider=north`, `depositMode=checkout`
- [ ] Checkout creates session with valid `checkoutUrl`
- [ ] Webhook `deposit.credited` processed once; ledger += `creditUsd`
- [ ] Duplicate event does not double balance
- [ ] Invalid `paymentMethod` → 400 from gateway
