# Slice 3 — сайт не бросает продавца

**Поверхность:** frontend (сайт)  
**Дата:** 30 августа 2026  
**Расширение:** достаточно **0.6.36** (Slice 2); новый zip не обязателен  

## Что сделано

### T10 / T11 — деградация инвентаря → Steam path
- При `STEAM_BLOCKED`, sync fail, stuck loading (>12 с) или stale cache сайт показывает баннер **«Выставить из Steam-инвентаря»**.
- Primary CTA открывает CS2 inventory (`#730_2`), где расширение рисует синюю «Продать».
- Secondary: Retry + Поддержка.
- Пустой failed-state больше не оставляет продавца со скелетонами без выхода.

### D4 — state machine модалки выставления
- Смена / закрытие лота сбрасывает `submitting`, `sellError`, `preview`, цену.
- In-flight list/cancel/update игнорируются по generation (`listingRequestGen`).
- Ошибки pricing-preview **не** протекают в `sellError` (фикс «на другом лоте уже Публикация / VAC»).
- `InventorySellPanel` keyed по `asset.id` — чистый remount между предметами.

### T3b — one-gesture pair
- Сайт-wide баннер: расширение установлено, но не paired → **«Подключить расширение»** одним кликом (без silent pair).
- Dismiss на сессию вкладки; на `/account` скрыт (там полный panel).
- Deep-link `/account#connect-extension` скроллит к панели подключения.
- На sell hint — ссылка в Steam inventory после pair.

## Как проверить

| # | Шаг | Ожидание |
|---|-----|----------|
| 1 | `/sell/inventory` при Steam block / «УСТАРЕЛО» без свежих данных | Баннер Steam path + CTA в Steam |
| 2 | Пустой loading > ~12 с | Баннер «загрузка затянулась» + Steam CTA |
| 3 | Открыть лот A → ошибка list → открыть лот B | Нет «Публикация…» / чужой ошибки на B |
| 4 | Быстро сменить лот во время submit | Ответ A не портит UI B |
| 5 | Логин + расширение установлено, не paired | Синий баннер «один клик» → Connect → paired |
| 6 | `/account#connect-extension` | Скролл к панели расширения |

## Зависимости
- Frontend deploy обязателен.
- Extension 0.6.36+ для Steam sell path (уже из Slice 2).
- Backend для этого среза не обязателен.
