# Gate 0 — Closure Checklist

**Status: CLOSED** (Phase 0 complete)

Gate 0 goal: stabilize the MVP backend, de-risk Steam integration, and make the platform operable before frontend work.

## Criteria

| # | Criterion | Evidence |
|---|-----------|----------|
| 1 | Git + CI pipeline | `.github/workflows/ci.yml` — lint, build, unit, e2e on Postgres 16 |
| 2 | README + runbook | `README.md`, `docs/runbook.md` |
| 3 | Provider interfaces + DI | `backend/src/providers/` — mock default, steam stubs |
| 4 | Mock MVP flow unchanged | E2E: `test/mvp-core.e2e-spec.ts`, `test/concurrency.e2e-spec.ts` |
| 5 | Steam spike decision | `docs/steam-spike.md` — **PARTIAL GO** (auth/inventory GO, auto trade verification NO-GO) |
| 6 | Ledger reconciliation | `LedgerReconciliationService`, `npm run reconcile:ledger`, e2e `test/reconciliation.e2e-spec.ts` |
| 7 | Reconciliation alerting | Daily cron + admin manual reconcile → outbox `RECONCILIATION_FAILED` → admin in-app notifications |
| 8 | Observability baseline | `X-Request-Id`, structured JSON HTTP logs, `GET /health/metrics`, DB ping in `GET /health` |
| 9 | Status event history | `LotStatusEvent`, `OrderStatusEvent` — recorded on every lot/order transition |

## Admin APIs added in Phase 0

| Endpoint | Description |
|----------|-------------|
| `POST /api/v1/admin/reconciliation/ledger` | Manual reconciliation run |
| `GET /api/v1/admin/orders/:id/status-events` | Order status transition history |
| `GET /api/v1/admin/lots/:id/status-events` | Lot status transition history |

Order card (`GET /admin/orders/:id`) includes `orderStatusEvents` and `lotStatusEvents`.

## Explicitly out of scope (later phases)

- Real Steam OpenID / inventory sync (Phase 4)
- Frontend (Phase 1+)
- Real payments, extension, ElasticSearch, microservices
- External alerting (PagerDuty/Sentry) — use logs + admin notifications for now

## Next phase

**Phase 1 — Vertical Slice Sell UI**

- React + TypeScript + Tailwind frontend skeleton
- Seller flow: inventory → list lot → view my lots
- Against mock providers (no Steam required)
