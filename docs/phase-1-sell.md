# Phase 1 — Vertical Slice #1: Sell

Seller path without Postman: **Login → Inventory → Create lot → My sales**.

## Gate 1 checklist

| Criterion | Status |
|-----------|--------|
| Seller: inventory → active lot → visible in my sales | Pass |
| Errors understandable in UI (`error.code` + message) | Pass |
| E2E UI test on sell flow | Pass (`frontend/e2e/sell-flow.spec.ts`) |
| Backend unit + API e2e still green | Pass |

## UI routes

| Route | Purpose |
|-------|---------|
| `/login` | Mock / Steam toggle, seller mock login |
| `/sell/inventory` | List items, start listing |
| `/sell/lots/new?assetId=` | Price form + commission preview |
| `/sell/my-lots` | Seller listings and statuses |

## API contract (sell slice)

| Method | Path | Auth |
|--------|------|------|
| GET | `/auth/config` | Public |
| POST | `/auth/mock-login` | Public |
| GET | `/auth/steam/login-url?returnUrl=` | Public (`steamLoginAvailable` when `AUTH_PROVIDER=steam`) |
| GET | `/inventory` | Bearer |
| GET | `/lots/pricing-preview?priceMinor=` | Public |
| POST | `/lots` | Bearer |
| GET | `/me/lots` | Bearer |

## Unified error format

All errors:

```json
{
  "error": {
    "code": "LOT_ALREADY_EXISTS_FOR_ASSET",
    "message": "This item already has an active listing",
    "statusCode": 400,
    "requestId": "uuid",
    "details": {},
    "fields": []
  }
}
```

Sell-relevant codes:

| Code | When |
|------|------|
| `VALIDATION_ERROR` | Invalid body (e.g. price) |
| `UNAUTHORIZED` | Missing/invalid JWT |
| `INVENTORY_ASSET_NOT_AVAILABLE` | Asset not `AVAILABLE` |
| `INVENTORY_ASSET_NOT_TRADABLE` | `tradable=false` |
| `INVENTORY_ASSET_TRADE_LOCKED` | Active trade lock |
| `LOT_ALREADY_EXISTS_FOR_ASSET` | Active/reserved lot for asset |
| `SELLER_NOT_ACTIVE` | Seller account blocked |

## Local run

```bash
# Terminal 1 — backend
cd backend
cp .env.example .env
npm run db:up
npm run prisma:migrate:deploy
npm run start:dev

# Terminal 2 — frontend
cd frontend
cp .env.example .env
npm ci
npm run dev
```

Open http://localhost:5173/login

## Tests

```bash
# Backend
cd backend && npm test && npm run test:e2e

# Frontend build/lint
cd frontend && npm run lint && npm run build

# UI E2E (starts backend on :3001 + frontend on :5173)
cd frontend && npm run test:e2e
```

UI E2E enables `ENABLE_TEST_ROUTES=true` and calls `POST /api/v1/test/reset` before each test.

## Env vars

| Variable | Where | Default |
|----------|-------|---------|
| `FRONTEND_ORIGIN` | backend | `http://localhost:5173` |
| `VITE_API_BASE_URL` | frontend | `http://localhost:3000/api/v1` |
| `ENABLE_TEST_ROUTES` | backend | unset (set `true` for UI e2e only) |

## Known limitations

- Steam sign-in requires `AUTH_PROVIDER=steam` — see [Phase 4.1 — Steam Auth](phase-4-steam-auth.md)
