# Phase 4 — Steam Integration (Rollout & Rollback)

This document covers Phase 4 modules 4.1–4.5 rollout order and the **mandatory rollback plan** for Gate 4.

## Module map

| Module | Doc | Purpose |
|--------|-----|---------|
| 4.1 | [phase-4-steam-auth.md](./phase-4-steam-auth.md) | Steam OpenID auth + link |
| 4.2 | [phase-4-inventory.md](./phase-4-inventory.md) | Real inventory sync |
| 4.3 | [phase-4-trade-poll.md](./phase-4-trade-poll.md) | Trade offer polling |
| 4.4 | [phase-4-shadow.md](./phase-4-shadow.md) | Shadow verification (no auto-settle) |
| 4.5 | [phase-4-settlement.md](./phase-4-settlement.md) | Limited real settlement |

## Recommended rollout sequence

1. **4.1** — Steam auth on staging
2. **4.2** — Inventory sync (mock trade still completes purchases)
3. **4.3** — Trade poll with `ENABLE_REAL_SETTLEMENT=false`
4. **4.4** — Shadow mode (`TRADE_VERIFICATION_MODE=shadow`) — compare Steam vs expected, no status/ledger changes
5. **4.5** — Live verification + allowlisted real settlement

## Gate 4 — exit criteria

| # | Criterion | How to verify |
|---|-----------|---------------|
| 1 | 10+ real inventory reads without incidents | Staging logs/metrics 7d |
| 2 | 5+ real trade checks correct | Manual test log + shadow snapshots |
| 3 | 0 ledger reconciliation issues 7d | `npm run reconcile:ledger` daily cron |
| 4 | Rollback verified | Switch to mock providers, E2E green |

---

## Instant rollback to mock product

Set these environment variables and redeploy **backend + frontend**:

```env
AUTH_PROVIDER=mock
INVENTORY_PROVIDER=mock
TRADE_PROVIDER=mock
TRADE_VERIFICATION_MODE=off
ENABLE_REAL_SETTLEMENT=false
ENABLE_MOCK_TRADE=true
```

### Verification after rollback

```bash
cd backend && npm run test:e2e
cd frontend && CI=true npm run test:e2e
```

Manual smoke: mock login → deposit → buy → mock-success → order `COMPLETED`.

### Deploy rollback order

1. Set env vars above in staging/prod secret store
2. Redeploy backend (poller stops, mock providers active)
3. Redeploy frontend (mock trade panel visible again)
4. Run E2E suite
5. Run `npm run reconcile:ledger` — investigate any open issues before closing incident

### In-flight `WAITING_TRADE` orders

Orders waiting for Steam trade when rollback happens:

| Status | Action |
|--------|--------|
| `WAITING_TRADE` | Leave as-is; buyer/seller complete via Steam manually or admin opens dispute |
| `TRADE_CONFIRMED` (unsettled) | Admin reviews order card → resolve dispute or retry settlement after re-enabling |
| `DISPUTE` | Normal admin resolution workflow |

**Do not** auto-fail or auto-settle in-flight orders during rollback. Ops should use admin order card + dispute tools.

### Kill switch (settlement only)

Without full provider rollback:

```env
ENABLE_REAL_SETTLEMENT=false
```

Poll/shadow verification can continue; confirmed orders stay at `TRADE_CONFIRMED` without ledger movement.
