# R.I.P. Market

CS2 P2P marketplace — backend + React UI (sell, buy, and ops flows).

Repository: [github.com/Mikhail-Sklyarenko/R.I.P.-Market](https://github.com/Mikhail-Sklyarenko/R.I.P.-Market)

## Status

| Phase | Gate | Status |
|-------|------|--------|
| Phase 0 | Gate 0 — foundation, providers, CI | Closed |
| Phase 1 | Gate 1 — seller vertical slice | Closed |
| Phase 2 | Gate 2 — buy + complete slice | Closed |
| Phase 3 | Gate 3 — dispute ops slice | Closed |
| Phase 4.1 | Gate 4.1 — Steam auth (OpenID) | Closed (code) |

## Quick start

```bash
# Backend
cd backend
cp .env.example .env
npm ci
npm run db:up
npm run prisma:generate
npm run prisma:migrate:deploy
npm run start:dev

# Frontend (new terminal)
cd frontend
cp .env.example .env
npm ci
npm run dev
```

- API: http://localhost:3000/api/v1
- Swagger: http://localhost:3000/api/docs
- UI: http://localhost:5173/login (Seller → `/sell/*`, Buyer → `/catalog`, Admin → `/admin/orders`)

## Documentation

- [Local runbook](docs/runbook.md)
- [Phase 1 — Sell slice](docs/phase-1-sell.md)
- [Phase 2 — Buy + Complete](docs/phase-2-buy-complete.md)
- [Phase 3 — Dispute Ops](docs/phase-3-dispute-ops.md)
- [Phase 4.1 — Steam Auth](docs/phase-4-steam-auth.md)
- [Steam spike](docs/steam-spike.md)

## Project layout

```
backend/     NestJS API, Prisma, PostgreSQL
frontend/    Vite + React UI (seller, buyer, admin ops)
docs/        Runbooks and phase docs
.github/     CI (backend, frontend, UI e2e)
```

## Tests

```bash
cd backend && npm test && npm run test:e2e
cd frontend && npm run lint && npm run build && npm run test:e2e
```

## Providers

`AUTH_PROVIDER`, `INVENTORY_PROVIDER`, `TRADE_PROVIDER` — `mock` (default) or `steam` (stubs). See Phase 0 docs.
