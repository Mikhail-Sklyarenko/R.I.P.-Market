# QA — extension 0.6.40 (SW `window is not defined`)

**Дата:** 31 авг 2026  
**Zip:** `browser-extension/rip-market-browser-extension-v0.6.40.zip`

## Проблема

На **вашей** машине Chrome → Errors:

`Uncaught (in promise) ReferenceError: window is not defined`  
в `background/service-worker.js`

Pair не завершался («Не подключено»), кнопка на сайте казалась мёртвой.

## Причина

В SW был MAIN-world код enrichment (`loadCs2EnrichmentFactsInPageMain`) с прямым `window` / `document`. В MV3 service worker этих объектов нет.

0.6.39 убрал только Vite `modulePreload`; этот второй источник остался.

## Фикс 0.6.40

| Изменение | Деталь |
|-----------|--------|
| `page-scripts/inventory-enrichment.js` | Enrichment только в MAIN world |
| SW | `files:` + тонкий bridge на `globalThis` (без `window`) |
| trade offer / inventory page scripts | `window`/`document` → `globalThis` в SW-бандле |
| `verify-dist` | Падает, если в SW снова есть `window.` / `document.` |

## Установка

1. `chrome://extensions` → **Удалить** старое расширение.
2. Load unpacked из zip **0.6.40** (или `browser-extension/dist`).
3. Перезапустить Chrome.
4. Очистить список Errors («Удалить все»).
5. p2pcs.ru → Аккаунт → **Подключить расширение** → статус «Подключено», Errors пустой.
