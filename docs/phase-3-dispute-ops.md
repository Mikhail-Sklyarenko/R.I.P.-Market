# Phase 3 — Vertical Slice #3: Dispute Ops

Ops can resolve incidents **without SQL** via the admin console.

## Gate 3 checklist

| Criterion | Status |
|-----------|--------|
| Fail-safe: refund + lot reopen (UI) | `frontend/e2e/ops-fail-safe.spec.ts` |
| Dispute → admin resolve buyer | `frontend/e2e/ops-dispute.spec.ts` |
| Dispute → admin resolve seller | `frontend/e2e/ops-dispute.spec.ts` + backend `mvp-core.e2e-spec.ts` |
| Outbox failed events + retry | `/admin/outbox` |
| E2E fail + dispute through UI/admin | Playwright ops specs |

## Admin routes

| Route | Purpose |
|-------|---------|
| `/admin/orders` | Order list |
| `/admin/orders/:id` | Order card (parties, trade, hold, ledger, audit, actions) |
| `/admin/outbox` | Outbox events (filter, retry, process pending) |

## Buyer dev panel (mock trade)

On `/orders/:id` when `WAITING_TRADE`:

- **Complete trade (mock)** — success path
- **Fail trade (safe)** — `FAILED`, refund, lot `ACTIVE`
- **Fail trade (dispute)** — `DISPUTE`, lot `BLOCKED`

Requires `ENABLE_MOCK_TRADE=true` and `VITE_ENABLE_MOCK_TRADE=true`.

## Admin actions

| Action | When | Result |
|--------|------|--------|
| Open dispute | Open order statuses (not already DISPUTE) | `DISPUTE`, lot `BLOCKED` |
| Resolve for buyer | `DISPUTE` | `FAILED`, refund, lot `ACTIVE` |
| Resolve for seller | `DISPUTE` | `COMPLETED`, settle seller |

All actions require a **reason** (min 3 chars) and `Idempotency-Key`.

## Manual smoke (3 browsers)

1. **Seller**: list $1000 skin
2. **Buyer**: deposit → buy → **Fail trade (dispute)**
3. **Admin**: login → `/admin/orders/:id` → **Resolve for buyer**
4. Verify buyer wallet restored, lot back in catalog
5. Repeat buy → dispute → **Resolve for seller** → seller +$950, lot SOLD

**Fail-safe (no admin):** buyer → **Fail trade (safe)** → immediate refund.

## Tests

```bash
cd backend && npm test && npm run test:e2e
cd frontend && npm run lint && npm run build && CI=true npm run test:e2e
```
