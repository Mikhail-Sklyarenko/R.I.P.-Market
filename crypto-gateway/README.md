# Crypto Gateway

USDT TRC-20 payment tunnel for R.I.P Market v2 closed beta.

## Processes

| Process | Env with MNEMONIC | Purpose |
|---------|-------------------|---------|
| `npm run dev:api` | No (use XPUB) | REST API for platform |
| `npm run dev:scanner` | No | TronGrid deposit scanner |
| `npm run dev:signer` | Yes | Payouts + sweep |

## Quick start (dev)

```bash
cd crypto-gateway
cp .env.example .env
npm ci
npm run prisma:generate
npm run prisma:migrate:dev
npm run dev:api
```

Platform webhook URL: `http://localhost:3000/api/v1/payments/webhooks/crypto`

Staging Docker stack: see [../docs/payments-crypto-tron.md](../docs/payments-crypto-tron.md) and root `docker-compose.staging.yml`.

## Pre-deploy

```bash
npm run build
npm run verify-wallets
```

## Tests

```bash
npm test
```

See [DECISIONS.md](./DECISIONS.md) for architecture.
