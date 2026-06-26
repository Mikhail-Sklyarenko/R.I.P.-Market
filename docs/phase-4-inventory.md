# Phase 4.2 — Real Inventory

**Module:** 4.2  
**Status:** Closed (code + automated tests)  
**Staging gate:** 10+ real syncs; create lot blocked on trade-locked items; TTL cache hit; `INVENTORY_PROVIDER=mock` rollback OK

---

## Overview

Steam community inventory API sync with DB-first caching (`InventorySyncRun`), no Redis.

```
GET https://steamcommunity.com/inventory/{steamId}/730/2?l=english&count=500
```

- Pagination via `more_items` + `start_assetid`
- Upsert `ItemDefinition` + `InventoryAsset` by `(ownerId, assetExternalId)`
- Fields: `tradable`, `tradeLockUntil`, `floatValue`, `paintSeed`, `wear`

Requires linked `User.steamId` (Phase 4.1).

---

## Cache policy

| Setting | Default | Description |
|---------|---------|-------------|
| `INVENTORY_SYNC_TTL_SECONDS` | 300 | Valid cache window |
| `INVENTORY_SYNC_MIN_INTERVAL_MS` | 60000 | Min time between Steam HTTP calls per user |

1. `expiresAt > now` and `status=SUCCESS` → serve DB, skip HTTP
2. Rate limit → serve DB, mark `stale` if TTL expired
3. Steam error + cached assets → serve DB with `X-Inventory-Stale: true`
4. Steam error + no cache → `503 INVENTORY_STALE`
5. Private inventory → `400 STEAM_PROFILE_PRIVATE`

`GET /inventory?forceRefresh=true` — sellers and admins only.

---

## Pre-list revalidation

`LotsService.create()` calls `inventoryService.syncForListing()` before asset checks (force sync when TTL expired).

---

## Stale asset cleanup

Cron every 6h: `AVAILABLE` assets without lots, `updatedAt` > 24h → `REMOVED`.

---

## API response

```json
{
  "assets": [...],
  "sync": {
    "lastSyncedAt": "2026-06-26T12:00:00.000Z",
    "expiresAt": "2026-06-26T12:05:00.000Z",
    "stale": false,
    "cacheHit": true,
    "status": "CACHE_HIT",
    "itemCount": 42
  }
}
```

Headers: `X-Inventory-Stale: true`, `X-Inventory-Warning` (when applicable).

---

## Metrics

`GET /health/metrics` includes:

```json
{
  "inventory": {
    "inventory_sync_total": { "SUCCESS": 10, "CACHE_HIT": 5 },
    "inventory_sync_duration_ms": 420,
    "inventory_sync_count": 15
  }
}
```

---

## Environment

| Variable | Required | Description |
|----------|----------|-------------|
| `INVENTORY_PROVIDER` | Yes | `mock` (default) or `steam` |
| `INVENTORY_SYNC_TTL_SECONDS` | No | Cache TTL (default 300) |
| `INVENTORY_SYNC_MIN_INTERVAL_MS` | No | Min interval between Steam fetches (default 60000) |

---

## Rollback

```bash
INVENTORY_PROVIDER=mock
# restart backend
```

Mock provider seeds inventory on first fetch; same API response shape and Playwright sell flow unchanged.

---

## Tests

| Layer | What |
|-------|------|
| Unit | `steam-inventory.parser.spec.ts`, `steam-inventory.client.spec.ts`, `steam-inventory.provider.spec.ts`, `inventory-sync-cache.service.spec.ts` |
| E2E backend | `test/steam-inventory.e2e-spec.ts` (sync, cache hit, list guards, private profile, forceRefresh RBAC) |
| E2E frontend | `e2e/inventory-sync.spec.ts` (sync metadata, refresh button) |
| Manual staging | `scripts/steam-inventory-smoke.ts` |

```bash
cd backend && npm test && npm run test:e2e
cd frontend && npm run lint && npm run build && CI=true npm run test:e2e
```

---

## Gate 4.2 checklist

| Criterion | Automated | Staging |
|-----------|-----------|---------|
| Steam fetch + upsert | ✅ backend e2e + unit | 10+ real syncs |
| TTL cache hit | ✅ backend e2e | manual |
| Non-tradable / trade-lock blocks listing | ✅ backend e2e | manual |
| Private inventory error | ✅ backend e2e + unit | manual |
| Stale fallback with cache | ✅ unit | manual |
| Seller UI sync + refresh | ✅ Playwright | manual |
| Rollback to mock | ✅ docs + config | flip env |

---

## Related

- [Phase 4.1 — Steam Auth](phase-4-steam-auth.md)
- [Runbook — provider switching](runbook.md#10-provider-switching-dev-only)
