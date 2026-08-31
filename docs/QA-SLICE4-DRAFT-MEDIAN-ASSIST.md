# Slice 4 — polish: draft / median / browser-assist

**Версия расширения:** 0.6.37  
**Дата:** 30 августа 2026  
**Zip:** `browser-extension/rip-market-browser-extension-v0.6.37.zip`

## Что сделано

### T6 — draft restore (Steam inventory tab)
- `sessionStorage` черновик: bulk mode, выбранные assetId, цена в sell panel.
- После F5 той же вкладки — восстановление + chip **«Восстановлено · выбрано N»**.
- Закрытие вкладки сбрасывает черновик (ожидаемо). Не обещаем persist между вкладками.

### Median — честный Steam median
- При live `priceoverview` бэкенд отдаёт `steamMedianPriceMinor`, если Steam прислал `median_price`.
- Sell panel / rails: **Steam (lowest)** + **Средняя Steam** только если median ≠ lowest.
- Не выдумываем «среднюю 7д» из одного guide.

### Extension-assisted sync (продуктовый MVP)
- На host bar: **«Обновить сайт из вкладки»**.
- Расширение шлёт снимок предметов с открытого Steam inventory → `POST /extension/inventory/browser-assist`.
- Проверка: paired session + `steamId` совпадает с аккаунтом.
- Сайт получает активы даже когда datacenter Steam block режет server sync.

## Как проверить

| # | Шаг | Ожидание |
|---|-----|----------|
| 1 | Bulk-выбор + F5 на той же вкладке Steam | Chip restore; чекбоксы на месте |
| 2 | Ввести цену в «Продать» → F5 → открыть тот же предмет | Цена восстановлена |
| 3 | Закрыть вкладку полностью → открыть снова | Черновика нет |
| 4 | Force refresh price-hints на предмете с median ≠ lowest | Строка «Средняя Steam» |
| 5 | Сайт STEAM_BLOCKED / пустой inventory → Steam tab → «Обновить сайт из вкладки» | Toast с count; `/sell/inventory` показывает предметы |

## Зависимости
- **Backend + frontend + extension 0.6.37** вместе.
- Без деплоя backend browser-assist и median не заработают полностью.

## QA note
Конкурирующие inventory-расширения (SIH и т.д.) усиливают reload Steam — для чистого теста draft использовать профиль без лишних overlay.
