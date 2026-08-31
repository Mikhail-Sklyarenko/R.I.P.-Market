# Slice 1 hotfix — «Можно продать без вранья» (0.6.35)

**Версия расширения:** 0.6.35  
**Дата:** 30 августа 2026  

## Что исправлено

1. **CTA «Открыть аккаунт»** без pair больше не ведёт на `localhost:5173` → всегда `https://p2pcs.ru/account` (или origin из `apiBaseUrl`).
2. **VAC / ban check**
   - `STEAM_VAC_BANNED` — только реальный VAC.
   - `STEAM_GAME_BANNED` — игровой бан (отдельный текст).
   - `STEAM_BAN_CHECK_UNAVAILABLE` (503) — «не удалось проверить, это не бан».
   - Retry ×2 на transient Steam API fail; ошибки проверки **не кэшируются** как бан.
3. **Выставление в расширении** — человеческие RU-сообщения вместо `Extension API /lots failed: 503…`; при hard ban кнопка «Выставить нельзя»; при unavailable — «Повторить».
4. **Сайт:** «Обновить из Steam» больше не даёт `FORBIDDEN` новым аккаунтам (убран role gate на force refresh).
5. **Модалка сайта:** смена предмета сбрасывает `submitting`; hard ban блокирует submit.

## Как проверить

| # | Шаг | Ожидание |
|---|-----|----------|
| 1 | Свежая установка 0.6.35, без pair → «Открыть аккаунт» | Открывается `p2pcs.ru/account`, не localhost |
| 2 | List при сбое Steam GetPlayerBans | Текст про «это не бан» + Повторить; **не** «VAC-бан» |
| 3 | Новый BUYER с Steam → `/sell/inventory` → Обновить из Steam | Нет `FORBIDDEN` |
| 4 | Hard VAC/game ban | Кнопка выставления disabled / «Выставить нельзя» |
| 5 | Ошибка на лоте A → клик лот B | Нет залипшего «Публикация…» |

## Файлы

- Backend: `steam-vac.service.ts`, `error-codes.ts`, `inventory.service.ts`
- Frontend: i18n + `InventorySellPanel` + `InventoryPage`
- Extension: `listing-api-errors.ts`, `popup.ts`, `service-worker.ts`, `inventory-bridge.ts`
- Zip: `browser-extension/rip-market-browser-extension-v0.6.35.zip`
