# QA — Inventory product layer 0.6.32

**Date:** 2026-08-27  
**Build:** `browser-extension/rip-market-browser-extension-v0.6.32.zip`

## Why this version

0.6.31 fixed holder selectors, but real Steam tabs still showed host bar without sell UX when:
1. Extension was reloaded without refreshing the inventory tab (`Extension context invalidated`)
2. Competitors win on the **selected item** panel (next to Steam green Sell), not only grid chips

## Product contract

| Surface | Behavior |
|---------|----------|
| Grid cells | Item-first paint (`item730_2_*` → holder). All visible-page cells paint immediately. |
| Selected item | Blue **«Продать на R.I.P»** injected into Steam `item_actions` next to green Sell |
| Extension reload | Banner + «Обновить страницу»; DOM paint still attempts; no uncaught storage crash |
| Host meta | `на экране: N` = same count as paintable cells |

## Install smoke

1. Remove old extension → load **0.6.32** (zip or `dist/`)
2. **Hard refresh** Steam CS2 inventory (F5) — do not skip
3. Expect on each visible card: blue **Продать** (or brand chip + CTA)
4. Click a knife/skin → right panel shows blue **Продать на R.I.P** beside Steam green Sell
5. Click blue CTA → R.I.P sell panel (not Community Market)
6. Reload extension in chrome://extensions without refreshing → host shows red reload banner (optional check)

## Automated

`cd browser-extension && npm test` — 236 passed.
