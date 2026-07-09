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
| Phase 4.2 | Gate 4.2 — Real inventory (Steam sync) | Closed (code) |
| Phase 4.3 | Gate 4.3 — Trade status check (Steam poll) | Closed (code) |
| Phase 4.4 | Gate 4.4 — Shadow verification | Closed (code) |
| Phase 4.5 | Gate 4.5 — Limited real settlement | Closed (code) |
| Phase 5 | Gate 5 — Extension-first trade flow | Closed (code) |

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

- [USDT TRC-20 payments (staging / runbook)](docs/payments-crypto-tron.md)
- [Release v1 checklist](docs/RELEASE.md)
- [QA / manual testing](TESTING.md)
- [QA staging guide — p2pcs.ru](docs/QA-STAGING-p2pcs.md)
- [QA — тестирование Chrome-расширения](docs/QA-EXTENSION-TESTING.md)
- [Local runbook](docs/runbook.md)
- [Phase 1 — Sell slice](docs/phase-1-sell.md)
- [Phase 2 — Buy + Complete](docs/phase-2-buy-complete.md)
- [Phase 3 — Dispute Ops](docs/phase-3-dispute-ops.md)
- [Phase 4.1 — Steam Auth](docs/phase-4-steam-auth.md)
- [Phase 4.2 — Real Inventory](docs/phase-4-inventory.md)
- [Phase 4.3 — Trade Status Check](docs/phase-4-trade-poll.md)
- [Phase 4.4 — Shadow Mode](docs/phase-4-shadow.md)
- [Phase 4.5 — Limited Real Settlement](docs/phase-4-settlement.md)
- [Phase 4 — Rollout & Rollback](docs/phase-4-steam.md)
- [Phase 5 — Extension-first trade flow](docs/phase-5-extension-first.md)
- [Steam spike](docs/steam-spike.md)
- [Browser extension (Stage 1)](docs/browser-extension.md)
- [Extension rollout runbook](backend/docs/extension-rollout-runbook.md)
- [Delivery verification decision table](backend/docs/delivery-verification-decision-table.md)
- [Settlement hold window](backend/docs/settlement-hold-window.md)
- [Dispute support runbook](backend/docs/dispute-support-runbook.md)
- [Extension flow observability](backend/docs/extension-flow-observability.md)

## Project layout

```
backend/     NestJS API, Prisma, PostgreSQL
frontend/    Vite + React UI (seller, buyer, admin ops)
extension/   Shared trade orchestrator library
browser-extension/  Chrome MV3 seller assistant
crypto-gateway/  USDT TRC-20 payment tunnel (api, scanner, signer)
docs/        Runbooks and phase docs
.github/     CI (backend, frontend, UI e2e)
```

## Tests

```bash
cd backend && npm test && npm run test:e2e
cd frontend && npm run lint && npm run build && npm run test:unit && npm run test:e2e
cd extension && npm test
cd browser-extension && npm test
```

Полный чеклист релиза: [docs/RELEASE.md](docs/RELEASE.md).

## Providers

`AUTH_PROVIDER`, `INVENTORY_PROVIDER`, `TRADE_PROVIDER` — `mock` (default) or `steam`. Auth, inventory, and trade status polling are implemented; automated trade-offer bot is deferred. See phase docs.
