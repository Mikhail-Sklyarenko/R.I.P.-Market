# Browser Extension (Stage 1)

Chrome MV3 extension for automatic trade offer creation on seller purchases.

## Build

```bash
cd extension && npm ci && npm test
cd ../browser-extension && npm ci && npm run build
```

Load unpacked extension in Chrome:

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select `browser-extension/dist`
4. Extension ID (stable, from manifest `key`): **`gmmlnkjdbcoojbhndjcfehojknjamaoj`**

For local dev, copy extension ID into `frontend/.env`:

```env
VITE_EXTENSION_ID=gmmlnkjdbcoojbhndjcfehojknjamaoj
```

Staging **p2pcs.ru** already ships with this ID in the frontend build.

## Pairing flow

1. Backend: enable extension flags (see `backend/docs/extension-rollout-runbook.md`)
2. Seller logs in on the site → **Account** → **Подключить расширение**
3. Extension polls tasks every ~15s and processes offers on steamcommunity.com
4. Seller confirms in Steam Guard when prompted

## Trade send modes

| Mode | When | How |
|------|------|-----|
| **UI trade** (target) | `ENABLE_EXTENSION_UI_TRADE_FLOW=true` on backend, or task payload `uiTradeFlow: true` | Content script autofill on Steam trade page; captures `tradeofferid` from send interceptor |
| **API fallback** (legacy) | Flag off, no per-task override | Direct POST via page script (`steam-trade-offer.ts`) — pre-rollout behavior |
| **Emergency API** | `chrome.storage.local.set({ USE_DIRECT_TRADE_API: true })` | Forces API path even when UI trade is enabled — ops only, not default |

On pair, the extension reads `/auth/config` and stores `extension.extensionUiTradeFlowEnabled` in `chrome.storage.local`. Per-task `uiTradeFlow: true` in the task payload can enable UI for a single order during staged rollout.

Backend env:

```env
ENABLE_EXTENSION_UI_TRADE_FLOW=true
```

## Architecture

```
Web app ──externally_connectable──► Extension service worker
                                         │
                                    poll tasks / report progress
                                         │
                              content script on steamcommunity.com
                                         │
                         UI autofill (default) │ API POST (legacy / emergency)
```

Shared orchestrator logic lives in `extension/` (`@rip-market/extension-orchestrator`).

Execution phases reported to backend: `ACKED` → `TRADE_PAGE_OPENED` → `OFFER_DRAFTED` → `ITEM_SELECTED` → `OFFER_SUBMITTED` → `CONFIRM_PENDING` → `OFFER_SENT`.

## Идеальный сценарий (happy path)

1. Backend: extension channel + task pipeline + orchestrator + `ENABLE_EXTENSION_UI_TRADE_FLOW=true`; продавец в rollout allowlist.
2. Продавец залогинен на сайте и в **том же Chrome** на [steamcommunity.com](https://steamcommunity.com) под тем же Steam-аккаунтом.
3. Покупатель с валидным Trade URL покупает лот → заказ `WAITING_TRADE`, создаётся `TradeTask`.
4. Продавец на **Account** жмёт «Подключить расширение» → pair OK, extension читает `/auth/config`.
5. Расширение poll (~15s): `ACKED` → открывает trade URL покупателя → `TRADE_PAGE_OPENED` / `OFFER_DRAFTED`.
6. UI autofill: предмет в offer → `ITEM_SELECTED` → submit → `OFFER_SUBMITTED`.
7. Steam возвращает `tradeofferid` → `CONFIRM_PENDING` (если Guard) или сразу `OFFER_SENT`.
8. Продавец подтверждает в Steam Mobile при необходимости.
9. Backend reconcile по `offerId` → trade reference на заказе, статус движется дальше.
10. Покупатель видит обновление на странице заказа (poll ~3s).

## Troubleshooting

| Симптом | Код / причина | Что делать |
|---------|---------------|------------|
| «Trade hold» / escrow | `TRADE_HOLD_BLOCKED` | Steam блокирует обмен. Подождать снятия hold или отправить offer вручную по Trade URL покупателя. |
| HTTP 400 / `strError` от Steam send | `OFFER_SEND_FAILED` | Проверить Trade URL покупателя, что предмет ещё в инвентаре, повторить. При повторе — ручная отправка. |
| Другой Steam в Chrome | `STEAM_ACCOUNT_MISMATCH` | Войти в steamcommunity.com под аккаунтом продавца или pair в нужном Chrome-профиле. |
| Инвентарь не грузится / 429 | `INVENTORY_NOT_LOADED` | Открыть steamcommunity.com, обновить страницу заказа. Опционально: Steam Web API key в popup расширения для fallback. |
| Предмет не найден | `ITEM_MISSING` | Синхронизировать инвентарь на сайте; убедиться, что скин не продан/не в hold. |
| Несколько одинаковых скинов | `ITEM_MISMATCH` | Указать offer вручную или пересоздать лот с уникальным asset. |
| Guard не подтверждён | `CONFIRM_PENDING` | Открыть Steam Mobile → подтвердить trade offer. |
| Сессия расширения | `SESSION_REVOKED` | Account → «Подключить расширение» снова. |

## Requirements

- Seller must be logged into [steamcommunity.com](https://steamcommunity.com) in the same browser
- Buyer must have a valid Trade URL in profile
- Extension rollout allowlist must include the seller (internal stage uses `EXTENSION_ROLLOUT_INTERNAL_USER_IDS`)
- Optional: Steam Web API key in extension popup for inventory fallback on 429

## Manual QA checklist (UI trade flow)

1. Backend: `ENABLE_EXTENSION_CHANNEL=true`, task pipeline + orchestrator + `ENABLE_EXTENSION_UI_TRADE_FLOW=true`; seller in rollout allowlist.
2. Build extension (`browser-extension/npm run build`), load unpacked, set `VITE_EXTENSION_ID` in frontend.
3. Seller: log in on site, open **Account**, pair extension (status connected).
4. Buyer: purchase seller lot → order `WAITING_TRADE`.
5. Seller: open order page — dev hint shows **UI trade** when flag on; extension task progress appears.
6. Extension poll: phases advance through `TRADE_PAGE_OPENED` → `ITEM_SELECTED` → `OFFER_SUBMITTED`.
7. Steam tab opens trade page; item is selected and offer is submitted (or `CONFIRM_PENDING` if Guard required).
8. Seller confirms in Steam Mobile if prompted → phase `OFFER_SENT` with valid numeric `offerId`.
9. Order trade reference reconciles; buyer sees updated status.
10. Rollback check: set `ENABLE_EXTENSION_UI_TRADE_FLOW=false`, re-pair — dev hint shows **API fallback**; new tasks use legacy path (or set `USE_DIRECT_TRADE_API` only for emergency).

## Localhost manual test checklist

Prerequisites: Postgres, `backend/.env`, `frontend/.env` with `VITE_API_BASE_URL=http://localhost:3000/api/v1`.

```bash
# Terminal 1 — API
cd backend && npm run start:dev

# Terminal 2 — frontend
cd frontend && npm run dev

# Terminal 3 — extension tests (smoke before manual run)
cd extension && npm test
cd ../browser-extension && npm test && npm run build
```

Backend `.env` (minimum for extension flow):

```env
ENABLE_EXTENSION_CHANNEL=true
ENABLE_EXTENSION_TASK_PIPELINE=true
ENABLE_EXTENSION_OFFER_ORCHESTRATOR=true
ENABLE_EXTENSION_UI_TRADE_FLOW=true
ENABLE_EXTENSION_ROLLOUT=true
EXTENSION_ROLLOUT_STAGE=internal
# EXTENSION_ROLLOUT_INTERNAL_USER_IDS=<seller-user-uuid>
```

| # | Step | Expected |
|---|------|----------|
| 1 | `GET /api/v1/auth/config` | `extension.extensionUiTradeFlowEnabled: true` |
| 2 | Load unpacked `browser-extension/dist`, set `VITE_EXTENSION_ID` | Extension visible in Chrome |
| 3 | Mock login Seller → Account → pair | Connected session |
| 4 | Mock login Buyer → buy lot | Order `WAITING_TRADE`, `tradeTask` on seller order API |
| 5 | Seller opens `/orders/:id` | `extension-task-progress`, dev hint «UI trade» |
| 6 | Wait for extension poll | Phases: ACKED → TRADE_PAGE_OPENED → ITEM_SELECTED |
| 7 | Steam tab (logged in as seller) | Trade page opens, item selected |
| 8 | Submit / Guard confirm | OFFER_SUBMITTED → CONFIRM_PENDING or OFFER_SENT |
| 9 | `offerId` on order / trade reference | Reconcile applied |
| 10 | `npm test` in `extension/` + `browser-extension/` | All green |

Automated UI check (optional): `cd frontend && npx playwright test e2e/extension-task-phase-progression.spec.ts`

## Emergency rollback

```js
// Force legacy API for one browser profile (ops)
chrome.storage.local.set({ USE_DIRECT_TRADE_API: true })
```

Clear with `chrome.storage.local.remove('USE_DIRECT_TRADE_API')`.
