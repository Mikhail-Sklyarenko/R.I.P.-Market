# QA — inventory item selector 0.6.42

## Проблема

Chrome Errors на странице инвентаря Steam:

`SyntaxError: Failed to execute 'querySelector' on 'Document': '#730_2_{assetId}' is not a valid selector.`

Steam DOM иногда использует id вида `730_2_50586843203` (начинается с цифры). Селектор `#730_…` в CSS невалиден; `querySelector` бросает исключение, и fallback `.item[id="…"]` не выполнялся (`??` исключения не ловит).

## Фикс

`queryCs2InventoryItemByAssetId` ищет только через attribute selectors:

`.item[id="item730_2_…"]`, `.item[id="item730_16_…"]`, `.item[id="730_2_…"]`, `.item[id="730_16_…"]`.

## Проверка

1. Load unpacked **0.6.42**, hard refresh вкладки инвентаря Steam.
2. В chrome://extensions → Errors — нет новых `SyntaxError` по `#730_2_*`.
3. Overlay / имена / bulk sell находят предметы с id `730_2_*` и `730_16_*`.
