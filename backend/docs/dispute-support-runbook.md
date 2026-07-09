# Support runbook — disputes (M8)

## 1. Triage

1. Open admin order card: `GET /admin/orders/:id`
2. Review unified timeline: `GET /admin/orders/:id/timeline`
3. Check `order.status`, `tradeOperation.failReasonCode`, hold balances (`capturedMinor`, `releasedMinor`)

## 2. Auto vs manual

- **AUTO** (`reviewType=AUTO`): system opened dispute — verify signals, then resolve buyer/seller.
- **MANUAL_REVIEW**: requires human decision before resolve.

## 3. Resolve

- **Buyer wins**: `POST /admin/orders/:id/resolve` `{ resolution: "BUYER", reasonCode, reasonNote }`
  - Blocked if hold already captured.
- **Seller wins**: same with `SELLER` — blocked if hold captured or amounts inconsistent.

## 4. Settlement hold reversal

If order is `SETTLEMENT_HOLD` and funds not released:
`POST /admin/orders/:id/reverse-settlement-hold` with `reasonNote` (+ optional `reasonCode=SETTLEMENT_HOLD_REVERSED`).

## 5. Audit

Every admin action requires `Idempotency-Key` and writes `AuditLog` with `beforeState` / `afterState` + `reasonCode`.
