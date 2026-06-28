# Phase 4.5 — Limited Real Settlement

**Module:** 4.5  
**Status:** Closed (code + automated tests)  
**Staging gate:** Allowlisted end-to-end settle; non-allowlisted blocked; daily caps enforced; 0 reconciliation issues 7d

---

## Policy (fixed)

**Both buyer AND seller** must be on the settlement allowlist (env and/or DB). This prevents one-sided rollout mistakes.

Requires `TRADE_VERIFICATION_MODE=live` and `ENABLE_REAL_SETTLEMENT=true`.

---

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLE_REAL_SETTLEMENT` | `false` | Master kill switch |
| `TRADE_VERIFICATION_MODE` | `live` | Must be `live` (not `shadow`) |
| `STEAM_SETTLEMENT_ALLOWLIST_STEAM_IDS` | — | Comma-separated Steam IDs (bootstrap) |
| `STEAM_SETTLEMENT_MAX_ORDER_MINOR` | `50000` | Per-order cap ($500 at 100 = $1) |
| `STEAM_SETTLEMENT_MAX_DAILY_ORDERS` | `3` | Platform daily order cap |
| `STEAM_SETTLEMENT_MAX_DAILY_VOLUME_MINOR` | `150000` | Platform daily volume cap |

---

## Flow

1. Steam poll confirms trade → `TRADE_CONFIRMED` + `TradeOperation.CONFIRMED`
2. `SettlementGuardService.canSettle(order)` checks allowlist, amount, daily limits, live mode
3. **Pass** → `settleCompletedOrder` → `COMPLETED` + ledger + `ORDER_COMPLETED` / `SALE_SETTLED`
4. **Fail** → stay `TRADE_CONFIRMED`, outbox `SETTLEMENT_BLOCKED` + buyer/seller notifications

Per-party DB allowlist entries may set a lower `maxOrderMinor` (effective limit = min of env, buyer entry, seller entry).

---

## Mock-complete in live mode

When `TRADE_VERIFICATION_MODE=live` and `ENABLE_REAL_SETTLEMENT=true`:

- **Buyer/seller**: mock-success API returns 400; UI hidden
- **Admin**: mock-success still allowed (goes through guard like poll path)

---

## Block codes

| Code | When |
|------|------|
| `REAL_SETTLEMENT_DISABLED` | Kill switch off |
| `NOT_LIVE_MODE` | Shadow or off verification mode |
| `TRADE_NOT_CONFIRMED` | Trade operation not CONFIRMED |
| `ORDER_NOT_TRADE_CONFIRMED` | Order not at TRADE_CONFIRMED |
| `MISSING_BUYER_STEAM_ID` / `MISSING_SELLER_STEAM_ID` | User not linked |
| `BUYER_NOT_ALLOWLISTED` / `SELLER_NOT_ALLOWLISTED` | Steam ID not on allowlist |
| `ORDER_AMOUNT_EXCEEDS_LIMIT` | Per-order cap |
| `DAILY_ORDER_LIMIT` | Platform daily order count |
| `DAILY_VOLUME_LIMIT` | Platform daily volume cap |

---

## Admin

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/admin/settlement/allowlist` | List DB + env entries |
| POST | `/admin/settlement/allowlist/:steamId` | Upsert DB entry |
| POST | `/admin/settlement/allowlist/:steamId/delete` | Remove DB entry |
| POST | `/admin/orders/:id/retry-settlement` | Retry guard + settle |
| GET | `/admin/orders/:id` | Order card with settlement badge |

UI: `/admin/settlement/allowlist`

Order card badges: **Real settlement eligible** / **Settlement blocked** / **Awaiting trade confirmation**

---

## User-facing

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/settlement/my-eligibility` | Allowlist status for banner |
| GET | `/auth/config` | `enableRealSettlement`, `liveVerificationMode` |

Order page banner when allowlisted + real settlement on.

---

## Kill switch (settlement only)

Without full provider rollback:

```env
ENABLE_REAL_SETTLEMENT=false
```

Poll/shadow verification continues; confirmed orders stay at `TRADE_CONFIRMED` without ledger movement.

---

## Tests

| Layer | What |
|-------|------|
| Unit | `settlement.config.spec.ts`, `settlement-guard.service.spec.ts` |
| E2E backend | `test/settlement-limited.e2e-spec.ts` (allowlist, caps, mock block, eligibility) |
| E2E frontend | `e2e/ops-settlement-allowlist.spec.ts` (admin allowlist CRUD) |
| Manual staging | Full allowlisted buy → poll → COMPLETED |

```bash
cd backend && npm test && npm run test:e2e -- settlement-limited
cd frontend && npm run lint && npm run build && CI=true npm run test:e2e
```

---

## Gate 4.5 checklist

| Criterion | Automated | Staging |
|-----------|-----------|---------|
| Allowlisted buyer+seller settle | ✅ backend e2e | inventory → list → buy → verify → settle |
| Non-allowlisted blocked + reason | ✅ backend e2e | manual |
| Daily order limit (`DAILY_ORDER_LIMIT`) | ✅ backend e2e | 4th order same day |
| Daily volume limit (`DAILY_VOLUME_LIMIT`) | ✅ backend e2e | manual |
| Mock-success blocked for users in live mode | ✅ backend e2e | manual |
| SETTLEMENT_BLOCKED notifications | ✅ code | manual |
| 0 reconciliation issues 7d | — | `npm run reconcile:ledger` |

---

## Related

- [Phase 4.4 — Shadow Mode](phase-4-shadow.md)
- [Phase 4 — Rollout & Rollback](phase-4-steam.md)
