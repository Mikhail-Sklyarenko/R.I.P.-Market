# Crypto Gateway — Architecture Decisions

## Permanent deposit address (not escrow-per-deal)

Each platform user gets one persistent TRC-20 address derived from BIP44 `m/44'/195'/0'/0/{wallet_index}`.
Deposits are detected on-chain, confirmed, credited to gateway internal balance, then webhook notifies platform ledger.

## Tunneling model

- **Gateway** owns on-chain truth (tx_hash, confirmations, payout).
- **Platform ledger** owns spendable balance for marketplace trades.
- Gateway never performs hold/settle — only `detected → credited` for deposits and `pending → paid` for withdrawals.

## Currency policy

- External: USDT TRC-20 on TRON mainnet (`USDT_CONTRACT` in env).
- Internal platform: USD minor (cents), **1 USDT = 1 USD**, no FX.
- Conversion: `amountMinor = amountSun / 10_000` (USDT has 6 decimals, cents have 2).

## Security

- MNEMONIC only in `signer` process.
- `api` and `scanner` never load seed material.
- `verify-wallets.js` gate before deploy.

## Idempotency

- `payments.tx_hash` UNIQUE — duplicate scan = no-op.
- `withdrawals.payout_tx_hash` UNIQUE when set.
- Webhook `event_id` UNIQUE on platform side.
