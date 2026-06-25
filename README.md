# R.I.P. Market

CS2 P2P marketplace backend. **Phase 0 (Gate 0) — CLOSED.**

Repository: [github.com/Mikhail-Sklyarenko/R.I.P.-Market](https://github.com/Mikhail-Sklyarenko/R.I.P.-Market)

## Status: Gate 0 — CLOSED ✓

| Criterion | Status |
|-----------|--------|
| CI green on every PR | GitHub Actions: build, lint, unit, e2e |
| Providers via DI, mock unchanged | `AUTH_PROVIDER`, `INVENTORY_PROVIDER`, `TRADE_PROVIDER` |
| Steam spike doc | [docs/steam-spike.md](docs/steam-spike.md) — **PARTIAL GO** |
| Ledger reconciliation + admin alerts | `npm run reconcile:ledger` + daily cron + outbox → admin notifications |
| Observability baseline | `X-Request-Id`, structured HTTP logs, `/health/metrics`, DB health check |
| Status event history | `LotStatusEvent`, `OrderStatusEvent` on every transition |

**Next:** Phase 1 — Vertical Slice Sell UI. See [docs/GATE0.md](docs/GATE0.md).

## Quick start

```bash
cd backend
cp .env.example .env
npm ci
npm run db:up
npm run prisma:generate
npm run prisma:migrate:deploy
npm run start:dev
```

- API: `http://localhost:3000/api/v1`
- Swagger: `http://localhost:3000/api/docs`
- Health: `GET /api/v1/health` (includes `database` field)
- Metrics: `GET /api/v1/health/metrics`

## Documentation

- [Gate 0 closure checklist](docs/GATE0.md)
- [Local runbook](docs/runbook.md) — setup, tests, troubleshooting
- [Steam spike](docs/steam-spike.md) — go / no-go / partial for Steam integration

## Project layout

```
backend/          NestJS API, Prisma, PostgreSQL
docs/             Runbook, Gate 0, Steam spike report
.github/workflows CI pipeline
```

## Providers (DI)

External integrations are behind provider interfaces. Default is `mock` (current MVP behaviour).

| Env var | Values | Interface |
|---------|--------|-----------|
| `AUTH_PROVIDER` | `mock` \| `steam` | `AuthProvider` |
| `INVENTORY_PROVIDER` | `mock` \| `steam` | `InventoryProvider` |
| `TRADE_PROVIDER` | `mock` \| `steam` | `TradeProvider` |

Steam implementations are stubs until Phase 4 (Steam incremental); see spike doc.

## Scripts

```bash
npm test              # unit tests
npm run test:e2e      # e2e (requires Postgres)
npm run reconcile:ledger   # ledger hold/order reconciliation (exit 1 on issues)
```

## CI

Every push/PR runs lint, build, unit tests, and e2e against Postgres 16 in GitHub Actions.
