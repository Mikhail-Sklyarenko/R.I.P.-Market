# QA — Inventory overlay product fix (0.6.31)

**Date:** 2026-08-27  
**Build:** `browser-extension/rip-market-browser-extension-v0.6.31.zip`

## Product intent

Steam CS2 inventory overlays that **beat MarketApp-class UX** on the grid:
- every visible CS2 cell has our layer (brand chip / float / lock / price + **Продать**)
- no dependency on fragile Steam inline `display:block`
- sell CTA never waits on Steam JSON

Not in scope: skins warehouse inside the popup.

## What changed

1. **Visibility model** — `#inventory_730_*` + `item730_2_*`, page visibility without requiring `style="display: block"`
2. **Host count = paint count** — host bar `на экране: N` uses the same list as overlays
3. **Card chrome** — stronger CTA, quieter badges (only decisions/blockers), brand chip when enrichment empty
4. **Copy** — card button `Продать` (aria: Продать на R.I.P); tips point at blue button vs Steam green Sell

## Smoke (manual)

1. Load unpacked `dist/` or zip **0.6.31** (remove old version first)
2. Pair extension → open Steam CS2 inventory
3. Expect: host bar shows `на экране: >0` **and** every visible cell has blue **Продать** (or Управлять / blocker)
4. Change inventory page → overlays move with the visible page
5. Click **Продать** → sell panel (not Steam Community Market)

## Automated

`cd browser-extension && npm test` — 228 passed (incl. modern DOM without `display:block`).
