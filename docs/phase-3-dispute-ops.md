# Phase 3 — Vertical Slice #3: Dispute Ops

Ops can resolve incidents **without SQL** via the admin console.

## Gate 3 checklist

| Criterion | Status |
|-----------|--------|
| Fail-safe: refund + lot reopen (UI) | `frontend/e2e/ops-fail-safe.spec.ts` |
| Fail-dispute + trade timeout → DISPUTE | `ops-dispute.spec.ts`, `ops-trade-timeout.spec.ts` |
| Admin open dispute from WAITING_TRADE | `ops-admin-open-dispute.spec.ts` |
| Dispute → admin resolve buyer | `ops-dispute.spec.ts`, `ops-admin-open-dispute.spec.ts` |
| Dispute → admin resolve seller | `ops-dispute.spec.ts` + backend `mvp-core.e2e-spec.ts` |
| Dispute notifications (buyer/seller) | `ops-dispute.spec.ts`, `ops-trade-timeout.spec.ts` |
| Outbox process pending + retry | `ops-outbox.spec.ts` |
| Admin order card (ledger, timeline, audit) | `/admin/orders/:id` |

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
- **Trade timeout (dispute)** — `DISPUTE` via `mock-timeout`

Requires `ENABLE_MOCK_TRADE=true` and `VITE_ENABLE_MOCK_TRADE=true`.

## Admin actions

| Action | When | Result |
|--------|------|--------|
| Open dispute | Open order statuses (not already DISPUTE) | `DISPUTE`, lot `BLOCKED` |
| Resolve for buyer | `DISPUTE` | `FAILED`, refund, lot `ACTIVE` |
| Resolve for seller | `DISPUTE` | `COMPLETED`, settle seller |

All actions require a **reason** (min 3 chars), confirmation dialog, and `Idempotency-Key`.

## Manual smoke (3 browsers)

1. **Seller**: list $1000 skin
2. **Buyer**: deposit → buy → **Fail trade (dispute)** or **Trade timeout**
3. **Admin**: login → `/admin/orders/:id` → **Open dispute** (optional) or resolve existing dispute
4. Verify buyer wallet restored (resolve buyer) or seller paid (resolve seller)
5. **Admin outbox**: `/admin/outbox` → process pending / retry stuck events

**Fail-safe (no admin):** buyer → **Fail trade (safe)** → immediate refund.

## Tests

```bash
cd backend && npm test && npm run test:e2e
cd frontend && npm run lint && npm run build && npm run test:e2e
```

UI E2E ops suite (7 tests):

- `ops-fail-safe.spec.ts` (1)
- `ops-dispute.spec.ts` (2)
- `ops-admin-open-dispute.spec.ts` (1)
- `ops-outbox.spec.ts` (2)
- `ops-trade-timeout.spec.ts` (1)

Full frontend E2E: **16 tests** (Phases 1–3).

Under `ENABLE_TEST_ROUTES`, the outbox interval processor is disabled so `ops-outbox.spec.ts` can exercise manual **Process pending**. Specs that assert notifications call `processPendingOutbox()` from `e2e/helpers/outbox.ts` before polling `/me/notifications`.

## Out of scope (Phase 4+)

- Real Steam trade verification
- Admin users / reconciliation UI
- External alerting (PagerDuty/Sentry)
