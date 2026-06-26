# Phase 2 — Vertical Slice #2: Buy + Complete

Full happy path: **deposit → buy → WAITING_TRADE → mock-success → COMPLETED** with notifications.

## Gate 2 checklist

| Criterion | Status |
|-----------|--------|
| Buyer: deposit → buy → waiting_trade → completed (UI) | Pass |
| Seller receives sellerReceiveMinor | Pass (API e2e assertion) |
| Platform commission in ledger | Covered by backend `mvp-core.e2e-spec.ts` |
| In-app notifications buyer/seller | Pass |
| UI E2E happy path | `frontend/e2e/buy-complete-flow.spec.ts` |
| Buyer order cancel (refund + lot reopened) | Pass — `buy-cancel-order.spec.ts` |
| Insufficient balance → wallet deposit flow | Pass — `buy-errors.spec.ts` |
| Seller cannot buy / reserved lot unavailable | Pass — `buy-errors.spec.ts` |
| Seller sees order in My orders | Pass — `seller-order-view.spec.ts` |
| Seller can cancel ACTIVE listing | Pass — `sell-flow.spec.ts` |

## UI routes (buyer)

| Route | Purpose |
|-------|---------|
| `/catalog` | Active lots |
| `/lots/:id` | Lot details + Buy |
| `/wallet` | Balances + mock deposit (with return URL) |
| `/orders/:id` | Order status, cancel, mock trade (dev) |
| `/my/orders` | Buyer and seller orders |

## Mock trade (dev/stage)

- Backend: `ENABLE_MOCK_TRADE=true` (default in `.env.example`)
- Frontend: `VITE_ENABLE_MOCK_TRADE=true`
- Order page shows **Complete trade (mock)** for **buyer** when status is `WAITING_TRADE`
- Seller sees waiting message without mock trade controls

## Idempotency

All POST mutations send `Idempotency-Key`:
- `POST /wallet/mock-deposit`
- `POST /orders`
- `POST /orders/:id/cancel`
- `POST /trades/:orderId/mock-success`
- `POST /lots/:id/cancel`

## Buy error codes

| Code | Meaning | UI behavior |
|------|---------|-------------|
| `INSUFFICIENT_BALANCE` | Deposit required | Redirect to `/wallet?returnUrl=&needed=` |
| `LOT_NOT_ACTIVE` | Listing unavailable | Disabled buy + message on lot page |
| `CANNOT_BUY_OWN_LOT` | Own listing | Seller role message on lot page |
| `LOT_HAS_OPEN_ORDER` | Concurrent purchase | Lot leaves catalog; RESERVED state on direct URL |
| `BUYER_NOT_ACTIVE` | Account blocked | Error alert |

## Manual smoke (two browsers)

1. **Seller**: login → inventory → list $1000 skin
2. **Buyer**: login → catalog → buy → deposit $2000 → buy → order WAITING_TRADE
3. **Buyer**: Complete trade (mock) → COMPLETED
4. **Seller**: wallet +$950, my sales SOLD, notification «Sale completed»
5. **Buyer**: notification «Deal completed»

**Cancel path:** buyer cancels WAITING_TRADE order → lot returns to catalog.

## Tests

```bash
cd backend && npm test && npm run test:e2e
cd frontend && npm run lint && npm run build && npm run test:e2e
```

UI E2E suite (8 tests):
- `sell-flow.spec.ts` (3)
- `buy-complete-flow.spec.ts` (1)
- `buy-errors.spec.ts` (3)
- `buy-cancel-order.spec.ts` (1)
- `seller-order-view.spec.ts` (1)

Full frontend E2E: **16 tests** across sell, buy, and ops flows.

## Related phases

Dispute ops UI and mock-fail flows are implemented in [Phase 3 — Dispute Ops](phase-3-dispute-ops.md).

## Out of scope (later phases)

- Real Steam trade
- Admin users / reconciliation console (Phase 4+)
