# Local Runbook — R.I.P. Market Backend

## Prerequisites

- Node.js 22+
- Docker (for PostgreSQL)
- npm

## 1. Environment

```bash
cd backend
cp .env.example .env
```

Key variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | local Postgres | Connection string |
| `PORT` | `3000` | HTTP port |
| `JWT_SECRET` | dev secret | JWT signing key |
| `AUTH_PROVIDER` | `mock` | `mock` or `steam` |
| `INVENTORY_PROVIDER` | `mock` | `mock` or `steam` |
| `TRADE_PROVIDER` | `mock` | `mock` or `steam` |

## 2. Database

```bash
npm run db:up                    # start Postgres (docker compose)
npm run prisma:generate
npm run prisma:migrate:deploy    # apply migrations
npm run db:down                  # stop Postgres
```

Postgres defaults: `cs2` / `cs2` @ `localhost:5432`, database `cs2_p2p_mvp`.

## 3. Run API

```bash
npm run start:dev     # watch mode
npm run start:prod    # after npm run build
```

Verify:

```bash
curl http://localhost:3000/api/v1/health
# {"service":"cs2-p2p-backend","status":"ok","database":"ok",...}

curl http://localhost:3000/api/v1/health/metrics
```

## 4. Mock auth flow (MVP)

```bash
# Login as buyer
curl -s -X POST http://localhost:3000/api/v1/auth/mock-login \
  -H 'Content-Type: application/json' \
  -d '{"role":"BUYER"}' | jq .

# Use accessToken as Bearer for protected routes
```

Roles: `SELLER`, `BUYER`, `ADMIN`.

## 5. Tests

```bash
npm test                 # unit
npm run test:e2e         # integration (DB must be up + migrated)
npm run lint
npm run build
```

E2E resets the database between tests. Use a dedicated local DB (not production).

## 6. Ledger reconciliation

Daily cron runs at 03:00 UTC when the app is running. Manual run:

```bash
npm run reconcile:ledger
```

Admin API (requires ADMIN JWT):

```bash
curl -X POST http://localhost:3000/api/v1/admin/reconciliation/ledger \
  -H "Authorization: Bearer <admin-token>"
```

Checks:

- Every `Hold` has a matching `Order` with the same `holdAmountMinor`
- No orphan ledger entries (`orderId` / `holdId` refs)
- Wallet `HOLD` balance equals sum of outstanding holds
- Terminal orders have holds fully captured or released

Exit code `1` if issues are found (CLI script).

Payment reconciliation (crypto_tron only), daily at 04:00 UTC:

```bash
npm run reconcile:payments
```

Admin API: `GET /admin/payments/reconciliation`. See [payments-crypto-tron.md](payments-crypto-tron.md).

On failure, the daily cron (03:00 UTC) and manual admin reconcile (`POST /admin/reconciliation/ledger`) publish an outbox event `RECONCILIATION_FAILED`. The outbox processor delivers in-app notifications to all `ADMIN` users.

## 7. Status events

Every lot and order status transition is persisted:

- `LotStatusEvent` — lot lifecycle (listed, reserved, sold, canceled, blocked)
- `OrderStatusEvent` — order lifecycle (created → completed/failed/dispute)

Admin APIs:

```bash
curl http://localhost:3000/api/v1/admin/orders/<orderId>/status-events \
  -H "Authorization: Bearer <admin-token>"

curl http://localhost:3000/api/v1/admin/lots/<lotId>/status-events \
  -H "Authorization: Bearer <admin-token>"
```

Also included in `GET /admin/orders/:id` order card response.

## 8. Observability

- **Request ID**: `X-Request-Id` header on every request (auto-generated or forwarded)
- **Structured logs**: JSON lines from `http` logger (`method`, `path`, `statusCode`, `durationMs`, `requestId`)
- **Metrics**: in-memory HTTP status buckets at `GET /api/v1/health/metrics`
- **Health**: `GET /api/v1/health` includes `database: ok|unavailable`
- **Audit logs**: `requestId` populated when writes happen inside an HTTP request

## 9. Troubleshooting

| Symptom | Fix |
|---------|-----|
| `Can't reach database` | `npm run db:up`, check `DATABASE_URL` |
| E2E connection refused | Postgres not running or wrong port |
| Prisma client missing | `npm run prisma:generate` |
| Migration drift | `npm run prisma:migrate:dev` locally, commit migration |
| Port 3000 in use | Change `PORT` in `.env` |

## 10. Provider switching (dev only)

```bash
# Mock product (default)
AUTH_PROVIDER=mock INVENTORY_PROVIDER=mock TRADE_PROVIDER=mock npm run start:dev

# Steam auth only (trade poll still mock)
AUTH_PROVIDER=steam STEAM_OPENID_REALM=http://localhost:3000 npm run start:dev

# Steam auth + inventory + trade poll
AUTH_PROVIDER=steam INVENTORY_PROVIDER=steam TRADE_PROVIDER=steam STEAM_OPENID_REALM=http://localhost:3000 STEAM_WEB_API_KEY=your_key npm run start:dev
```

See [phase-4-steam-auth.md](phase-4-steam-auth.md) for OpenID callback URLs and staging smoke (`scripts/steam-login-smoke.ts`).

See [phase-4-inventory.md](phase-4-inventory.md) for inventory sync, TTL cache, and staging smoke (`scripts/steam-inventory-smoke.ts`).

See [phase-4-trade-poll.md](phase-4-trade-poll.md) for trade offer reference, poller, and staging checklist.

## 11. Frontend (Phase 1 sell UI)

```bash
cd ../frontend
cp .env.example .env
npm ci
npm run dev
```

Seller UI: http://localhost:5173/login

UI E2E (Playwright, backend on port 3001):

```bash
cd frontend
npm run test:e2e
```
