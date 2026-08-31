# QA — CS2 modern DOM ids (0.6.34)

**Date:** 2026-08-27  
**Build:** `browser-extension/rip-market-browser-extension-v0.6.34.zip`

## Root cause (from live console)

Steam inventory cells are no longer only `item730_2_*`.

Observed on production page:

```text
730_16_50620552134   // app 730, context 16 (Trade Protected), assetId …
```

Also: `#inventory_730_2` may be absent while hash is `#730_2` and `#inventories` has ~100 `.item` nodes.

Old extension looked only for `item730_2_*` → `steamItems: 0` → no overlays / sell / bulk.

## Product fix

- Parse legacy `item730_{ctx}_{asset}` and modern `730_{ctx}_{asset}`
- Context **16** = Trade Protected → baseline `tradable: false` + lock signal
- Find CS2 container via `#inventory_730_2` / `#inventory_730_16` / any ctn with CS2 items
- Paint + selected rail + bulk use the shared selector

## Smoke

1. Install **0.6.34**, hard refresh Steam CS2 inventory  
2. Console:

```js
({
  holdersAttr: document.querySelector('#rip-market-inventory-layer')?.getAttribute('data-item-holders'),
  steamItems: document.querySelectorAll('.item[id^="item730_"], .item[id^="730_"]').length,
  ourOverlays: document.querySelectorAll('.rip-item-enrich').length,
  ourSellButtons: document.querySelectorAll('.rip-item-sell').length,
})
```

Expect: `holdersAttr` and `ourOverlays` / `ourSellButtons` > 0 when grid is loaded.  
3. Context-16 items: muted / trade-lock style, not fake “Tradable”.  
4. Bulk: checkboxes after «Множественная продажа».  
5. Click item → blue «Продать на R.I.P» in market_actions.

## Automated

`cd browser-extension && npm test`
