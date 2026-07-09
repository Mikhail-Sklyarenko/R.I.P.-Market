# Settlement Hold Window (M7)

Funds remain in the buyer `HOLD` wallet account during `SETTLEMENT_HOLD` until `settlementHoldUntil`.

## Financial invariants

1. **Single capture** — `settleSale()` runs at most once per order (`idempotencyKey = settlement-release:{orderId}`).
2. **Amount balance** — `sellerReceiveMinor + commissionMinor === hold.amountMinor` before release.
3. **No double release** — release blocked when `hold.capturedMinor > 0` or `hold.settlementReleasedAt` is set.
4. **Hold audit dedup** — enter/release/reverse each have dedicated audit `idempotencyKey`.
5. **Pre-release reversal** — only while `capturedMinor = 0`; refunds via `refundHold()` with `settlement-hold-reverse:{orderId}`.
6. **Settlement guard** — release still requires `ENABLE_REAL_SETTLEMENT`, live verification, allowlist, and daily caps.

## Recovery after worker crash

1. Worker is idempotent — rerun `releaseDueHolds()` or wait for next `@Interval` tick.
2. Check `AuditLog` for `SETTLEMENT_HOLD_RELEASED` and ledger `SETTLEMENT_SELLER` by `orderId`.
3. If ledger posted but order not `COMPLETED`, manual reconcile: align order state to `COMPLETED` using existing admin tools (do not repost ledger).
4. If worker died before ledger, safe to retry release — `settleSale` idempotency prevents duplicate credits.
5. Orders past `settlementHoldUntil` with `status=SETTLEMENT_HOLD` are picked up on next batch scan (`ORDER BY updatedAt ASC`).
