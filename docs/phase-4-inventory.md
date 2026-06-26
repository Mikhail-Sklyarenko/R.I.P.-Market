# Phase 4.2 — Real Inventory

**Module:** 4.2  
**Status:** Implemented  
**Gate:** Staging — 10+ real syncs; create lot blocked on trade-locked items; TTL cache hit; `INVENTORY_PROVIDER=mock` rollback OK

---

## Overview

Steam community inventory API sync with DB-first caching (`InventorySyncRun`), no Redis.

```
GET https://steamcommunity.com/inventory/{steamId}/730/2?l=english&count=500
```

- Pagination via `more_items` + `start_assetid`
- Upsert `ItemDefinition` + `InventoryAsset` by `(ownerId, assetExternalId)`
- Fields: `tradable`, `tradeLockUntil`, `floatValue`, `paintSeed`, `wear`

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

## Rollback

`INVENTORY_PROVIDER=mock` — mock seed on first fetch, same API response shape.

---

## Tests

- `steam-inventory.parser.spec.ts` — fixture JSON parsing
- `steam-inventory.provider.spec.ts` — cache hit + upsert (mocked HTTP)
