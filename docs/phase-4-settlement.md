# Phase 4.5 — Limited Real Settlement

Real ledger settlement is enabled only for **allowlisted Steam IDs** with strict per-order and daily caps.

## Policy (fixed)

**Both buyer AND seller** must be on the settlement allowlist (env and/or DB). This prevents one-sided rollout mistakes.

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLE_REAL_SETTLEMENT` | `false` | Master kill switch |
| `TRADE_VERIFICATION_MODE` | `live` | Must be `live` (not `shadow`) |
| `STEAM_SETTLEMENT_ALLOWLIST_STEAM_IDS` | — | Comma-separated Steam IDs (bootstrap) |
| `STEAM_SETTLEMENT_MAX_ORDER_MINOR` | `50000` | Per-order cap ($500 at 100 = $1) |
| `STEAM_SETTLEMENT_MAX_DAILY_ORDERS` | `3` | Platform daily order cap |
| `STEAM_SETTLEMENT_MAX_DAILY_VOLUME_MINOR` | `150000` | Platform daily volume cap |

## Flow

1. Steam poll confirms trade → `TRADE_CONFIRMED` + `TradeOperation.CONFIRMED`
2. `SettlementGuardService.canSettle(order)` checks allowlist, amount, daily limits, live mode
3. **Pass** → `settleCompletedOrder` → `COMPLETED` + ledger + `ORDER_COMPLETED` / `SALE_SETTLED`
4. **Fail** → stay `TRADE_CONFIRMED`, outbox `SETTLEMENT_BLOCKED` + user notifications

## Mock-complete in live mode

When `TRADE_VERIFICATION_MODE=live` and `ENABLE_REAL_SETTLEMENT=true`:

- **Buyer/seller**: mock-success API returns 400; UI hidden
- **Admin**: mock-success still allowed (goes through guard like poll path)

## Admin

| Endpoint | Purpose |
|----------|---------|
| `GET /admin/settlement/allowlist` | List DB + env entries |
| `POST /admin/settlement/allowlist/:steamId` | Upsert DB entry |
| `POST /admin/settlement/allowlist/:steamId/delete` | Remove DB entry |
| `POST /admin/orders/:id/retry-settlement` | Retry guard + settle |
| Order card | Badge: eligible / blocked / awaiting confirmation |

UI: `/admin/settlement/allowlist`

## User-facing

- `GET /settlement/my-eligibility` — allowlist status for banner
- Order page banner when allowlisted + real settlement on

## Gate 4.5

- [ ] Allowlisted user: inventory → list → buy → steam verify → real settle
- [ ] Non-allowlisted: verify works, settlement blocked with clear reason
- [ ] 4th order same day rejected (`DAILY_ORDER_LIMIT`)
- [ ] 0 reconciliation issues 7d on staging (`npm run reconcile:ledger`)

See [phase-4-steam.md](./phase-4-steam.md) for full Gate 4 + rollback.
