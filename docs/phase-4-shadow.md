# Phase 4.4 — Shadow Mode

Real Steam trade verification is compared against expected outcomes. Order status is **not** auto-updated from poll results; settlement stays mock/manual.

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `TRADE_VERIFICATION_MODE` | `live` | `off` \| `shadow` \| `live` (legacy: `STEAM_POLL` → `live`) |
| `ENABLE_REAL_SETTLEMENT` | `false` | **Must** be `false` in shadow mode |
| `ENABLE_MOCK_TRADE` | `true` | Allows mock-complete for comparison |

## Flow

1. **Steam poller** (SHADOW orders): calls real Steam API, writes `TradeVerificationSnapshot` (`STEAM_POLL`), does **not** transition order status.
2. **Mock-complete** in shadow: writes `MOCK_MANUAL` snapshot only — no ledger or status change.
3. **Comparator** computes `match`; mismatch emits `TRADE_SHADOW_MISMATCH` outbox → admin notifications.
4. **Admin** can manually **Apply observed status** on the order card (promotes to `TRADE_CONFIRMED` / fail / dispute without auto-settlement unless `ENABLE_REAL_SETTLEMENT=true`).

## Gate 4.4

- Shadow mode: 5+ orders with real poll, 0 unintended status changes
- Mismatch generates admin notification
- Mock-complete in shadow does not touch ledger

## Metrics

- `GET /health/metrics` → `tradeShadow.trade_shadow_mismatch_total`
- `GET /admin/metrics/shadow` → `{ mismatchesLast7d }`
