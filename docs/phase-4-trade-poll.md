# Phase 4.3 — Trade Status Check

**Module:** 4.3  
**Status:** Closed (code + automated tests)  
**Staging gate:** Real trade offer accepted via poll; timeout → DISPUTE; Steam 429 backoff; `TRADE_PROVIDER=mock` rollback OK

---

## Overview

Background polling for `WAITING_TRADE` orders when `TradeOperation.status = WAITING` and `verificationMode` is `STEAM_POLL` or `SHADOW`.

**In scope:** seller pastes trade offer ID/URL → poller checks Steam / inventory delta → order moves to `TRADE_CONFIRMED` or dispute/fail.

**Out of scope (deferred):** browser extension, Steam bot auto-offer creation, `completeTrade()` automation.

Requires Phase 4.1 (linked `steamId`) and Phase 4.2 (inventory sync for delta checks).

---

## Verification strategies

| Strategy | When | Action |
|----------|------|--------|
| `OFFER_POLL` | `externalOfferId` set | Steam `IEconService/GetTradeOffer` → accepted / declined / expired |
| `INVENTORY_DELTA` | no offer id | seller lost asset + buyer gained matching `assetExternalId` |
| `TIMEOUT` | `TRADE_TIMEOUT_MINUTES` elapsed | `applyTradeTimeout()` → DISPUTE |

Poller interval: `TRADE_POLL_INTERVAL_SECONDS` (default 30). Disabled when `TRADE_PROVIDER=mock` or `ENABLE_TEST_ROUTES=true`.

---

## Seller flow

1. Buyer creates order → `WAITING_TRADE`, `TradeOperation.verificationMode = STEAM_POLL` (when `TRADE_PROVIDER=steam`).
2. Seller sends trade offer manually in Steam client.
3. Seller opens order page → pastes **trade offer ID or URL** → `PATCH /orders/:id/trade-reference`.
4. Poller tracks offer state; admin sees `TradePollEvent` history on order card.

---

## Schema

`TradeOperation` fields: `externalOfferId`, `lastCheckedAt`, `checkCount`, `expectedAssetId`, `verificationMode`.

`TradePollEvent` — poll history (`strategy`, `result`, `checkedAt`) for admin order card.

---

## API

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `PATCH` | `/orders/:id/trade-reference` | Seller | Body: `{ offerId? }` or `{ tradeUrl? }` — parses Steam trade offer URL |
| `PATCH` | `/users/me/trade-url` | User | Save seller Steam trade URL (shown on order page) |

`GET /auth/config` includes `tradeProvider`.

---

## Settlement

| `ENABLE_REAL_SETTLEMENT` | Poll detects accept |
|------------------------|---------------------|
| `false` (default) | Order → `TRADE_CONFIRMED` only (no ledger capture) |
| `true` | Full settlement path (same as mock-success) |

Use `false` in staging until trade verification is trusted end-to-end.

---

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `TRADE_PROVIDER` | `mock` | `steam` enables poller + `STEAM_POLL` verification mode |
| `STEAM_WEB_API_KEY` | — | Required for `GetTradeOffer` (not needed in `SHADOW` mode) |
| `TRADE_VERIFICATION_MODE` | `STEAM_POLL` | `SHADOW` = dry-run (always pending) |
| `TRADE_POLL_INTERVAL_SECONDS` | `30` | Poller interval |
| `TRADE_TIMEOUT_MINUTES` | `60` | Auto-dispute timeout |
| `TRADE_FAIL_MODE` | `DISPUTE` | declined/expired → `SAFE` or `DISPUTE` |
| `TRADE_POLL_BACKOFF_MS` | `120000` | Backoff per order after Steam 429 |
| `ENABLE_REAL_SETTLEMENT` | `false` | Poll confirm stops at `TRADE_CONFIRMED` when false |
| `ENABLE_MOCK_TRADE` | `true` | Buyer mock trade buttons (dev/stage) |

---

## Error codes

| Code | When |
|------|------|
| `VALIDATION_ERROR` | Invalid or missing `offerId` / `tradeUrl` on trade-reference |
| `BAD_REQUEST` | Trade reference only allowed in `WAITING_TRADE`; `completeTrade` not available on steam provider |

---

## Rollback

```bash
TRADE_PROVIDER=mock
# restart backend
```

Poller skips; mock trade endpoints (`/trades/:id/mock-success`, etc.) unchanged. Playwright buy flow uses mock trade.

---

## Tests

| Layer | What |
|-------|------|
| Unit | `trade-offer.util.spec.ts`, `trade-status-poller.service.spec.ts`, `steam-trade.provider` (via poller mocks) |
| E2E backend | `test/trade-poll.e2e-spec.ts` (trade-reference, verification mode, URL parse) |
| E2E frontend | Covered by `buy-complete-flow.spec.ts` (mock trade); seller offer UI on `OrderPage` |
| Manual staging | Real Steam offer + `STEAM_WEB_API_KEY` + poll until `TRADE_CONFIRMED` |

```bash
cd backend && npm test && npm run test:e2e
cd frontend && npm run lint && npm run build && CI=true npm run test:e2e
```

---

## Gate 4.3 checklist

| Criterion | Automated | Staging |
|-----------|-----------|---------|
| Seller saves trade offer reference | ✅ backend e2e | manual |
| Offer URL parsing | ✅ unit + e2e | manual |
| `STEAM_POLL` verification mode on order | ✅ backend e2e | manual |
| Poller timeout → dispute | ✅ unit | manual |
| Steam 429 backoff | ✅ unit | manual |
| Admin poll history | ✅ UI (order card) | manual |
| Inventory delta fallback | ✅ code | manual |
| Rollback to mock | ✅ docs + config | flip env |

---

## Related

- [Phase 4.1 — Steam Auth](phase-4-steam-auth.md)
- [Phase 4.2 — Real Inventory](phase-4-inventory.md)
- [Steam spike — bot deferred](steam-spike.md)
- [Runbook — provider switching](runbook.md#10-provider-switching-dev-only)
