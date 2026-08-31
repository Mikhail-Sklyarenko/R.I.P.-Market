# QA — Inventory product layer 0.6.33

**Date:** 2026-08-27  
**Build:** `browser-extension/rip-market-browser-extension-v0.6.33.zip`

## Root causes fixed

1. **Selected CTA** was looking at `item_actions` (Inspect). Steam green Sell lives in **`item_market_actions`**.
2. Selected asset required `.activeInfo` — now also **last click** + panel name match.
3. Grid overlays were siblings of Steam `.item` and got **covered** by artwork → no «Продать», no bulk checkboxes. Overlays now mount **inside** `.item` with `z-index: 1000`.
4. Bulk toggle now **forces re-paint** so checkboxes appear immediately.

## Smoke

1. Remove old extension → load **0.6.33** → **hard refresh** Steam CS2 inventory  
2. Grid: every visible cell shows blue **Продать** (or R.I.P chip + CTA)  
3. Click a knife → right panel: blue **Продать на R.I.P** next to green Steam Sell  
4. **Множественная продажа** → checkboxes on cards + bottom «Выбрано» bar  
5. No errors in chrome://extensions

## Console (optional)

```js
chrome.runtime.getManifest().version // 0.6.33
document.querySelectorAll('.rip-item-enrich').length // > 0
document.querySelector('#rip-market-selected-sell') // after click item
document.querySelectorAll('.rip-item-select').length // > 0 in bulk mode
```

## Automated

`cd browser-extension && npm test`
