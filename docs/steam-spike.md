# Steam Integration Spike — Go / No-Go / Partial

**Date:** 2026-06-25  
**Scope:** Auth (OpenID), inventory read, tradable / trade-lock checks, trade verification without browser extension  
**Verdict:** **PARTIAL GO** — login and inventory are automatable server-side; full trade verification without extension is **NO-GO**

---

## Executive summary

| Area | Verdict | Automatable without extension? |
|------|---------|--------------------------------|
| Login (Steam OpenID) | **GO** | Yes |
| Read inventory | **GO** | Yes (with API key + public inventory) |
| Tradable / trade lock | **PARTIAL** | Yes for read; enforcement needs periodic sync |
| Trade offer creation | **PARTIAL** | Requires bot account with 2FA / identity secret |
| Trade offer acceptance verification | **NO-GO** (full auto) | No — user must confirm in Steam client |
| Trade completion proof (buyer received item) | **PARTIAL** | Poll inventory history / asset ownership delta |

**Recommendation:** Proceed to Phase 1 with Steam auth + inventory sync. Defer automated trade execution to a **bot + manual confirmation UX** or **extension-assisted** flow. Do not block Gate 0 on Steam wiring.

---

## 1. Login — Steam OpenID 2.0

### What works

- Standard redirect flow to `https://steamcommunity.com/openid/login`
- Callback verification via `openid.mode=check_authentication` POST to Steam
- Extract `steamId` from `openid.claimed_id` (`https://steamcommunity.com/openid/id/<steamid64>`)

### Implementation notes

- Provider stub: `SteamAuthProvider.getSteamLoginUrl()` in `backend/src/providers/auth/steam-auth.provider.ts`
- Realm and return URL must match deployment (`STEAM_OPENID_REALM`)
- No API key required for login

### Risks

- Low. Well-documented, used by thousands of sites.

**Verdict: GO**

---

## 2. Read inventory

### API

`GET https://steamcommunity.com/inventory/{steamId}/730/2?l=english&count=500`

- App ID `730` = CS2
- Context `2` = player inventory
- Returns `assets`, `descriptions`, `asset_properties` (float, paint seed when available)

### Requirements

- User inventory must be **public** OR request made with session cookies (not ideal server-side)
- `STEAM_WEB_API_KEY` not required for community inventory endpoint
- Rate limits: ~1 req/s per IP; use caching and backoff

### Data mapping

| Steam field | Our model |
|-------------|-----------|
| `assetid` | `assetExternalId` |
| `market_hash_name` | `ItemDefinition.marketHashName` |
| `tradable` (from description) | `tradable` |
| `cache_expiration` / lock metadata | `tradeLockUntil` |

**Verdict: GO** (for public inventories; private inventories need user session or extension)

---

## 3. Tradable / trade lock

### Sources

- `descriptions[].tradable` — 0 = not tradable
- `descriptions[].market_tradable_restriction` — days remaining
- `owner_descriptions` / `cache_expiration` on asset — trade lock until timestamp

### Automation

- **Read-only checks:** fully automatable on sync
- **Enforcement at listing time:** re-sync before `Lot` goes `ACTIVE`
- **Enforcement at trade time:** re-fetch asset; reject if lock appeared since order

### Gaps

- Steam can change tradability between order and trade (buyer/seller 7-day hold, market cooldown)
- Requires periodic re-validation job, not one-time check

**Verdict: PARTIAL GO** — automate reads; accept residual timing risk or add re-check before trade bot sends offer

---

## 4. Trade verification without extension

### What Steam allows server-side

| Action | Server automatable? | Notes |
|--------|---------------------|-------|
| Create trade offer (bot → user) | Yes | `node-steam-tradeoffer-manager` + Steam user session |
| List pending offers | Yes | Bot API |
| Detect offer accepted/declined/expired | Yes | Poll offer state |
| Force user to accept on mobile/desktop | **No** | User action required in Steam Guard |
| Verify item landed in buyer inventory | **Partial** | Poll buyer inventory; compare `assetid` |
| Verify seller no longer owns asset | **Partial** | Same |
| Detect scam / item swap mid-trade | **No** | Without client-side DOM/extension |

### Why full automation is NO-GO

1. **Steam ToS / technical:** Automated trade confirmation on behalf of users requires their session or mobile confirm — cannot be done purely backend without bot holding items.
2. **P2P marketplace model:** Seller must send trade from their account. Backend cannot click "Accept" in seller's Steam client without:
   - Browser extension injecting into Steam pages, OR
   - Seller running a desktop helper, OR
   - Custodial bot (items deposited to bot — different product)
3. **Trade offer state ≠ delivery:** Offer accepted does not instantly guarantee correct item; must verify `assetid` and `classid`/`instanceid` match listing.

### What we can automate (partial path)

```
Order WAITING_TRADE
  → Bot or seller client creates offer (out of band)
  → Backend polls: GET trade offer status via bot API
  → On 'accepted': poll buyer inventory for expected assetExternalId
  → If match within TTL: TRADE_CONFIRMED → settle ledger
  → Else: DISPUTE
```

**Verdict: PARTIAL** — status polling and inventory delta checks yes; initiating and confirming seller-side actions no without extension/bot custody.

---

## 5. Comparison: mock vs Steam providers

| Capability | Mock provider | Steam provider (current) |
|------------|---------------|--------------------------|
| Login | Role-based JWT | OpenID URL stub; callback not wired |
| Inventory | Seed 3 skins | `NotImplementedException` |
| Trade complete | HTTP mock endpoints | `NotImplementedException` |

Gate 0 keeps `mock` as default. Steam stubs prove DI wiring without breaking MVP.

---

## 6. Recommended Phase 1 sequence

1. Wire `SteamAuthProvider.login()` — OpenID callback + user upsert by `steamId`
2. Wire `SteamInventoryProvider` — sync job + `tradable` / `tradeLockUntil`
3. Add `TradeStatusPoller` service (Steam bot) — **do not** block on seller extension
4. UX: seller confirms trade in Steam; backend polls until timeout → dispute flow
5. Re-evaluate extension only if conversion requires one-click sell

---

## 7. Gate 0 decision matrix

| Question | Answer |
|----------|--------|
| Can we ship MVP on mock? | Yes |
| Can we add Steam login without extension? | Yes |
| Can we verify trades 100% server-only? | **No** |
| Safe to start frontend after Gate 0? | Yes, against mock providers |
| Blocker for real money + real skins? | Trade confirmation path (partial) |

**Final: PARTIAL GO for Steam integration program; NO-GO for fully unattended trade verification without extension or custodial bot.**
