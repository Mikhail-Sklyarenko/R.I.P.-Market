# QA — extension 0.6.39 (pair / Failed to fetch)

**Дата:** 31 авг 2026  
**Zip:** `browser-extension/rip-market-browser-extension-v0.6.39.zip`

## Что было

Тестировщик видел:

1. Каталог / mock login → сырой **`Failed to fetch`** (API недоступен с его сети).
2. `/sell/inventory` без логина → гейт Steam (ожидаемо).
3. «Подключить расширение» → **`window is not defined`** (кнопка казалась «мёртвой»).

## Что исправлено в 0.6.39

| Область | Фикс |
|--------|------|
| MV3 service worker | Убран Vite `modulePreload` (`window`/`document` в SW). |
| Pair / SET_LOCALE | Статический import i18n — без `import()` в SW. |
| verify-dist | Падает сборка, если в SW снова попал preload / dynamic import. |
| Ошибки pair | Человекочитаемый текст вместо `window is not defined` / `Failed to fetch`. |
| Сайт (frontend) | То же для pair + `ErrorAlert` при сетевых ошибках каталога/login. |

## Как проверить тестировщику

1. Дожать обновление Chrome и перезапустить браузер.
2. Удалить старое unpacked → Load unpacked из **новой** `dist` / zip **0.6.39**.
3. Войти на p2pcs.ru через **Steam** (не обязательно `/login?dev=1`).
4. Аккаунт → **Подключить расширение** — без `window is not defined`, статус «Подключено».
5. Если снова «нет связи с сервером» — это сеть/VPN до API; F12 → Network на `.../api/v1/...`.

Сайтные правки `ErrorAlert` / тексты pair нужны на staging после деплоя frontend.
