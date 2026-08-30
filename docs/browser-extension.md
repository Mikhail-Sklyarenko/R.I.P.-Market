# Browser Extension (Stage 1)

Chrome MV3 extension for automatic trade offer creation on seller purchases.

## Build

**Для тестировщиков (без сборки):** подробная инструкция — [QA-EXTENSION-TESTING.md](./QA-EXTENSION-TESTING.md). Кратко: скачайте zip с [GitHub Releases](https://github.com/Mikhail-Sklyarenko/R.I.P.-Market/releases) (`rip-market-browser-extension-v*.zip`), распакуйте и в Chrome выберите папку **`dist`** внутри архива.

**Для разработчиков:**

```bash
cd extension && npm ci && npm test
cd ../browser-extension && npm ci && npm run build
# или: bash scripts/package-browser-extension-release.sh
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
3. Extension polls tasks (adaptive idle/active; Chrome may clamp sub-minute alarms) and processes offers on steamcommunity.com
4. Seller confirms in Steam Guard when prompted

## Trade send modes

| Mode | When | How |
|------|------|-----|
| **UI trade** (target) | `ENABLE_EXTENSION_UI_TRADE_FLOW=true` on backend, or task payload `uiTradeFlow: true` | Content script autofill on Steam trade page; captures `tradeofferid` from send interceptor; reports `ITEM_SELECTED` / `OFFER_SUBMITTED` mid-flow |
| **API fallback** (legacy) | Flag off, no per-task override | Direct POST via page script (`steam-trade-offer.ts`) — pre-rollout behavior |
| **Emergency API** | `chrome.storage.local.set({ USE_DIRECT_TRADE_API: true })` | Forces API path even when UI trade is enabled — ops only, not default |

**Idempotency (A1):** successful sends are written to durable `chrome.storage.local` (`rip:sent-offer:*` / `rip:intercepted-offer:*`). Re-poll after SW restart or interceptor timeout will not create a second Steam offer. Concurrent sends for the same draft are blocked while `rip:send-inflight:*` is active.

**Guard UX (A3):** when Steam requires mobile confirmation (offer state 9), the order page and extension keep an explicit Guard wait state (`tradeTask.confirmPending`) with an elapsed timer — even after `OFFER_SENT`. Steam poll advancing to Active (state 2) clears Guard automatically (no F5). The extension **never** confirms Guard itself.

**Manual fallback (A4):** when auto-offer fails (task `FAILED` / `OFFER_FAILED`, hold, send errors, max attempts, or no task), the seller gets a primary panel: one-tap buyer Trade URL → checklist → paste `offerId`. Popup / Steam overlay use `nextAction.kind = send_manual` with the same Trade URL CTA. Manual is never buried only in FAQ or a collapsed “extra” block.

**Observability (A5):** clients see a deal-health strip (`ok` / `warn` / `error`) plus one-click **support debug pack**. Ops habit: admin `/admin/extension` shows KPI gates (completion ≥70%, task success ≥85%, dispute ≤15%), active alerts, fail-reason tops, and kill-switch/rollout — not only logs. Enable with `ENABLE_EXTENSION_FLOW_OBSERVABILITY=true`.

**Trust layer / offer list (B1):** on `steamcommunity.com/my/tradeoffers/` each card gets a badge — **Сделка R.I.P** / **Подозрительно** / **Не наша сделка** — with color outline + shield. Toolbar filter «Только сделки R.I.P». Badge click opens deal details (item, price, SteamID, status, order link). Never auto-accepts.

**Guided gate on offer (B2):** on `/tradeoffer/:id` the overlay is a decision gate — large status («Скин совпал» / «Не совпадает — не принимайте»), expected vs observed (name, assetId, float, stickers), counterparty SteamID64 + copy, hold reminder (money on platform — don’t pay in chat). Buyer is urged to Accept via Steam **only when `verified`**; on `mismatch` the panel blocks with order + report-issue CTAs. Extension never clicks Accept.

**Anti-scam rules in UI (B3):** offer page + list warn on (1) partner requesting your items, (2) extra items in the offer, (3) Steam trade hold/escrow copy on the page, (4) offerId not linked to an active R.I.P order (blocking panel even without a matched trade). Sticky hint: never accept trades from chat / stranger profiles. Never auto-accept.

**Mismatch sync on site (B4):** when the extension verifies an offer (with observed item data or a mismatch), the backend persists an `EXTENSION` verification snapshot. `GET /orders/:id` returns `tradeVerification` (status, failed checks, nextAction). Order page next-step + deal-health use the **same mismatch copy** as overlay/popup (`report_issue` / «Не принимайте»). Re-verify with a matching observed item clears the gate on the next order load.

**Post-accept trust surface (B5):** after Steam accept, `/orders/:id` shows a calm trust panel — for `TRADE_CONFIRMED` dual-signal progress (Steam offer + inventory), for `SETTLEMENT_HOLD` role-specific copy (seller: chargeback/reversal protection + hold-until; buyer: item is yours, seller paid after review). Popup/overlay `platform_verifying` nextAction matches. Order page also polls `SETTLEMENT_HOLD`.

**Buyer pairing at the right moment (C1):** on `/orders/:id` in `WAITING_TRADE` **after** `externalOfferId` appears, buyers get an in-order CTA «Подключить расширение для безопасного accept» (not only Account). Deal-health warns while disconnected.

**Buyer accept wizard (C2):** once the offer exists, the buyer panel shows a **3-step** guide — (1) open **this** `tradeoffer/{id}` (not the inbox), (2) verify shield / float / SteamID in the overlay, (3) Accept in Steam and return — status updates itself. Mismatch blocks the wizard with support.

**Buyer ack in the scenario (C3):** «Вижу верное предложение» is a **primary** action on step 2 (not buried in `<details>`). After accept / delivery path — «Предмет в инвентаре» is also primary; it helps ops/delivery but never replaces dual-signal confirmation.

**Buyer inbox in popup (C4):** connected popup shows a **Покупки** section — active buys with phases *ждать оффер / принять / проверяется / спор*, action-needed first. Accept CTA is **«Открыть проверенный оффер в Steam»** → deep link `tradeoffer/{id}` (not the Steam inbox). Open disputes (`DISPUTE` / mismatch) appear in the same inbox. Sales stay in a separate **Продажи** block.

**Timeout / escalation (C5):** order page + buyer wizard + popup show a plain-language countdown to auto-dispute (urgency bands). **«Проблема с обменом»** / **«Открыть спор»** open `/support` with `dealId`, `offerId`, `topic=deal`, `reason`, `verifyStatus`, and base64url `evidence` prefilled; ticket body gets a verify snapshot from evidence (or sessionStorage when same-tab). Never auto-accepts or auto-opens disputes from the client.

**Seller inventory layer (D1):** content script on `steamcommunity.com/*/inventory*` mounts a non-invasive R.I.P host bar **only when CS2 (app 730) is active** (hash `#730_2` or active game tab). Native Steam item cells are not rewritten — overlays append on top. Connected → CTA to site sales; disconnected → pair on Account.

**Inventory card enrichment (D2):** discovers CS2 cells via legacy `item730_*` **and** modern Steam ids `730_2_*` / `730_16_*` (Trade Protected). Overlay mounts inside `.item` with **Продать** / bulk checkboxes. Context 16 is shown honestly (not tradable until unlock). Selected rail uses `#iteminfo*_item_market_actions`.

**Inventory price intel (D3):** connected session loads `POST /inventory/price-hints` for visible market hash names. Card strip: **R.I.P ~$X** (Steam−5% recommended, or listed price) + Steam guide secondary + «на R.I.P от …» when marketplace min exists + **вам ~$Y** after 5% commission (same math as `/lots/pricing-preview`). Live Steam fetch may also expose **median** (`steamMedianPriceMinor`) as «Средняя Steam» when it differs from lowest. Disconnected → no price strip (float/badges still work).

**Sell draft restore (T6 / Slice 4):** bulk selection + typed sell price persist in `sessionStorage` for the Steam inventory tab; F5 restores with a host chip. Closing the tab clears the draft.

**Browser-assist inventory sync (Slice 4):** host CTA **«Обновить сайт из вкладки»** posts a paired snapshot to `POST /extension/inventory/browser-assist` so site inventory can recover when datacenter Steam sync is blocked.

**One-click sell (D4):** each eligible CS2 card shows **«Продать на R.I.P»**. Mini-panel: price (prefilled Steam−5% or best bid) → live commission / «вам» preview → confirm → extension `POST /lots` (resolves platform inventory UUID via `GET /inventory`, `POST /inventory/:id/check`). Success toast + **Открыть лот** / **Мои объявления**. Safety: blocks trade-lock / not tradable / in-deal; already listed → **Открыть лот**; disconnected → soft gate to Account pair. Never mutates Steam item nodes beyond overlay/panel.

**Bid list / honest “instant” (D5):** buy-side exists as open **buy requests** (order-book bids), but matching is **notify-only** — there is no auto-fill / instant payout API. Product therefore does **not** fake «моментальная продажа». Instead: `POST /inventory/price-hints` returns `bestBidMinor` + `bestBidQuantity`; cards show a **Bid** signal; sell panel offers **«По bid $X»** (one-tap list at best bid + honesty line that the buyer is notified). When true sell-into-bid settlement ships later, this CTA can upgrade without teaching users a lie.

**Bulk sell (D6):** host toggle **«Множественная продажа»** → checkboxes on listable cards (cap 50). Bottom bar: count + plan summary + **Выставить**. Same price for the batch. Planner: identical fungibles (no float/seed/wear) → `POST /lots/bulk` (2–50); differentiated skins / mixed → sequential `POST /lots`. Result UI: created/failed counts, **Повторить ошибки**, listings deep link. Never mutates Steam item nodes beyond overlay/selection chrome.

**Manage listing (D7):** ACTIVE listed cards show **«Управлять»** instead of only opening the lot. Mini-panel: current price → edit + commission preview → **Сохранить цену** (`PATCH /lots/:id/price`) / **Снять с продажи** (`POST /lots/:id/cancel`, confirm) / **Открыть лот**. RESERVED / in-deal lots stay blocked (seller APIs reject non-ACTIVE). No fake “renew” until listing expiry exists.

**Pre-list safety (D8):** soft gate when extension is disconnected; block list on trade-lock / not tradable / not marketable / non-listable type (medals…) / RESERVED / active seller deal / **in-flight trade task** for that Steam asset (cached from `pollTasks` → `expectedAssetId`). Create path always `POST /inventory/:id/check` then validates AVAILABLE + eligibility before `POST /lots` (same for sequential bulk). Badge **Обмен идёт** when a task is active.

**Seller onboarding in Steam (D9):** first CS2 inventory visit shows a one-shot coach mark («Выставляйте сюда — обмен при покупке уйдёт сам») with **Понятно** + ~30s auto-dismiss (`chrome.storage.local`). Host checklist: **расширение подключено** + **Trade URL на сайте** (via `GET /users/me`); deep links to Account. Checklist stays visible while incomplete; once both ready and coach is dismissed, the host bar stays clean.

**Popup Home dashboard (E1):** popup is the daily ops home — connection strip (site paired + Steam match), **«Требует действия»** on top (Re-pair / Steam mismatch / Guard / Accept / Mismatch / manual), then scrollable purchases & sales (up to 25 active trades, no hard 3–5 cut). Actionable deals stay in the action queue; wait/verifying stay in role lists. Calm empty state when nothing needs attention.

**Next-action engine (E2):** every deal/session card has **exactly one primary CTA**. Seller: «Подтвердите в Steam Mobile» / «Открыть Trade URL» / «Повторить отправку». Buyer: «Открыть проверенный оффер» / «Ждём продавца» / «Открыть спор». Ack and support live under **«Ещё»** so they never compete with the main step. Runtime retry uses `RIP_MARKET_POLL_NOW`.

**Quiet notifications (E3):** Chrome notifications only for **Guard** / **Accept-ready** / **Mismatch**, and only when the deal fingerprint changes (no per-poll spam). ≥2 new events → one grouped alert. Per-deal mute via notification button «Скрыть на сделку»; global toggle + unmute in popup **Дополнительно**. Min interval 20s between any alerts.

**Ops health (E4):** under the connection strip the popup shows **last successful poll** (relative age, warn/error when stale), **Steam rate-limit** state (live probe + 2‑min window after last 429), and **version** with **«Обновить расширение»** → GitHub Releases. Poll timestamps update on task/active-trades success; included in support debug pack.

**Manual create on Trade Offers (F1):** on `steamcommunity.com/.../tradeoffers/` the toolbar lists seller deals that still need an offer (`send_manual` / waiting without `offerId`) with **«Собрать оффер #…»**. Click opens the buyer Trade URL in a **new** tab and runs the same UI autofill pipeline as auto-send (item + partner + branded note). Success acks `SELLER_ACK_SENT` and best-effort `OFFER_SENT` on an existing task; Guard is still confirmed only in Steam Mobile. Never auto-accepts.

**Manual accept assist (F2):** on the tradeoffers list, verified **buyer** deals show **«Принять (Steam)»** beside the R.I.P badge (and in the detail popover) → deep link to `tradeoffer/{id}`. On the offer page, verified buyers get a primary **«Принять (Steam)»** that highlights Steam’s Accept, then requires a second click **«Подтвердить Accept в Steam»** before the extension clicks the Steam control. Never auto-accepts without that double confirm; mismatch / anti-scam blocks hide the assist.

**Offer card context (F3):** each R.I.P-marked tradeoffers card shows a context strip — **order short id**, **price**, **role** (Покупка/Продажа), and **platform status** (Ждёт Accept / Ждём Guard / Не совпадает / Hold…), plus item name. Click opens the detail popover with the same fields. Foreign offers stay unmarked (no fake context).

**Settlement transparency (G1):** popup cards in `TRADE_CONFIRMED` / `SETTLEMENT_HOLD` show a calm post-accept block — **delivery dual-signal** (Steam offer + inventory) while verifying, then **«Средства будут доступны: дата»** (seller) / payout wording (buyer) from `settlementHoldUntil` (8-day hold). Active trades API now returns `settlementHoldUntil` + `deliveryProgress`.

**In-flow dispute (G2):** on mismatch / `DISPUTE` / `report_issue`, popup + overlay + buyer inbox primary CTA is **«Открыть спор»** → `/support` with deal/offer/verify fields **and** a base64url `evidence` pack (works across extension → site without sessionStorage). Order page mismatch / DISPUTE use the same path. Support ticket body is prefilled from evidence; dispute status strip appears on affected popup cards. Never auto-opens disputes from the client.

**Post-trade receipt (G3):** after `COMPLETED`, order page and popup show a calm **квитанция** — sold/bought item, deal price, **5% platform fee**, net (paid / credited), Steam `offerId`, and a link to the order (popup: wallet/deals CTAs on site). Active-trades API includes up to 5 deals completed in the last 14 days plus `commissionMinor` / `sellerReceiveMinor`.

**Language (H1):** extension popup, Steam overlay, inventory layer, and tradeoffers assists use the same **RU/EN** locale as the website. Locale is stored in `chrome.storage.local`, synced on **pair** and whenever the site language changes (`RIP_MARKET_SET_LOCALE`), and can be overridden under popup **Advanced**. Default remains Russian.

**Performance (H2):** inventory enrich is **viewport-lazy** (IntersectionObserver + rAF batches, sync cap ~48) and only targets the **active** Steam inventory page — not every pre-rendered page (fixes 1k+ item jank). Active trades poll uses a **20s TTL cache**, serves stale on errors, and **backs off on HTTP 429** (Retry-After / exponential, shared cooldown). Steam inventory fetch retries use the same exponential delay.

**Security UX (H3):** Steam Web API key is **not** part of normal setup — it lives under popup **Advanced → Support · emergency access**, never auto-opens Advanced, and rate-limit health copy tells users to wait / contact support (no “enter a key” push). Saving a key requests **optional** `https://api.steampowered.com/*` only then; clearing the key revokes that host. Popup shows a calm **what we do / don’t** strip plus a short permission rationale list. Required permissions stay minimal (`storage`, `alarms`, `tabs`, `scripting`, `cookies`, `notifications` + Steam/platform hosts).

**Offline / partial (H4):** when the site is unreachable or polls go stale, the extension enters **safe mode**: popup shows a banner + **cached active trades** (session + durable local snapshot), keeps mismatch / Guard / Accept warnings, and **blocks list / send / ack / lot manage**. Inventory bar switches to safe-mode copy (no bulk sell); tradeoffers hides «Собрать оффер». Mutations are also hard-gated in the service worker. Mode clears automatically on the next successful poll.

**Two-minute onboarding (H5):** popup shows a calm **4-step wizard** — installed → pair on site → open CS2 inventory → trial list — with one primary CTA per step (~2 minutes). Visiting Steam inventory while paired marks the inventory step; the first successful `POST /lots` (single or bulk) completes the path. After checklist readiness, inventory shows a **trial list** tip. Site account panel after pair points sellers to CS2 inventory. Wizard can be dismissed with «Позже».

**Support bridge (H6):** one popup button **«Скопировать отчёт для поддержки»** builds a compact pack (`orderId`, `phase`, `errorCode`, `extensionVersion`, `steamMatch`) from session health + active trades, copies a support-ready ticket body, and opens `/support?topic=extension&supportPack=…` so the site prefills the ticket. Full JSON remains in the body for ops.

**Extension-aware buy/sell web UX (I1):** the website tells one extension story from CTA → deal. Order page: buyer pair prompt or ready + deep link to the verified offer, mismatch banner (no accept), seller auto-send progress with manual fallback nearby; next-action hero adapts to extension online/offline. Purchase cards and inventory sell show a soft trust strip (install / pair / connected) without blocking buy or list; deal-flow steps switch to auto-send + shield copy when the extension channel is enabled.

**Pricing API for overlay (I2):** `POST /api/v1/extension/inventory/suggested-prices` (extension session Bearer, batch up to 200) returns suggested list price + fee preview per `marketHashName` and/or `steamAssetId` (`bid` ?? Steam−5%, commission 5%). The same suggestion fields are also attached to `POST /inventory/price-hints`. The inventory overlay prefers the extension endpoint and falls back to price-hints.

**Listing-from-extension auth (I3):** paired extension can `POST /lots`, `/lots/bulk`, manage price/cancel, and call inventory/check + `GET /users/me` with the **extension session Bearer** — no site user JWT and no extra capability token. Dual-auth (`UserOrExtensionAuthGuard`) accepts `typ: 'extension'` via session validation or a normal user JWT; revoked extension tokens never fall through to JwtAuthGuard. Set `EXTENSION_TOKEN_SECRET` distinct from `JWT_SECRET` in staging/prod.

**Adaptive poll / push-like wake (I4):** no FCM — Chrome MV3 clamps sub-minute alarms. The extension switches **idle vs active** alarm cadence from active trades + heartbeat `hasPendingTask` / `hasActiveDeal` hints (`POST /extension/heartbeat`). Active ≈ aggressive task/active-trades poll; idle calms to ~1–2 min. New sales also fire a quiet `new_deal` Chrome notification (same E3 fingerprint rules). Site `RIP_MARKET_POLL_NOW` remains the fastest path when the order page is open.

**Feature flags (I5):** three independent client UX kills exposed on `GET /auth/config` and synced into `chrome.storage.local` on pair + heartbeat (no re-pair needed):

| Flag env | Public field | Default | Gates |
|----------|--------------|---------|-------|
| `ENABLE_EXTENSION_INVENTORY_LAYER` | `extensionInventoryLayerEnabled` | **on** (unset) | Steam inventory overlay mount |
| `ENABLE_EXTENSION_GUIDED_BUYER` | `extensionGuidedBuyerEnabled` | **on** (unset) | Site `BuyerAcceptWizard`; Steam accept-assist (B1 badges + mismatch stay) |
| `ENABLE_EXTENSION_QUIET_NOTIFICATIONS` | `extensionQuietNotificationsEnabled` | **on** (unset) | Quiet Chrome notifications + popup toggle |

Kill-safe: set `=false` to disable. Missing env / missing storage key = **on** so live UX does not regress. Enable/kill order in incidents: guided → quiet → inventory last (Steam DOM risk). Snapshot also appears on Admin → Extension Ops.

On pair, the extension reads `/auth/config` and stores `extension.extensionUiTradeFlowEnabled` in `chrome.storage.local`. Per-task `uiTradeFlow: true` in the task payload can enable UI for a single order during staged rollout.

Backend env:

```env
ENABLE_EXTENSION_UI_TRADE_FLOW=true
```

Trade acknowledgment (internal deal confirmation in extension):

```env
ENABLE_EXTENSION_TRADE_ACKNOWLEDGMENT=true
```

I5 client UX (unset = on; set `false` to kill):

```env
# ENABLE_EXTENSION_INVENTORY_LAYER=false
# ENABLE_EXTENSION_GUIDED_BUYER=false
# ENABLE_EXTENSION_QUIET_NOTIFICATIONS=false
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

### Trade acknowledgment (v0.5+)

When `ENABLE_EXTENSION_TRADE_ACKNOWLEDGMENT=true`:

- Extension polls `POST /extension/trades/active` for buyer and seller
- Popup shows active deals and next action
- Content script overlay on `steamcommunity.com/tradeoffer/*` verifies deal before Steam accept
- Buyer can tap **«Подтверждаю, принимаю в Steam»** → `BUYER_ACK_PRE_ACCEPT`
- `TRADE_CONFIRMED` still comes from platform dual-signal, not from extension ack alone

Execution phases reported to backend: `ACKED` → `TRADE_PAGE_OPENED` → `OFFER_DRAFTED` → `ITEM_SELECTED` → `OFFER_SUBMITTED` → `CONFIRM_PENDING` → `OFFER_SENT`.

## Идеальный сценарий (happy path)

1. Backend: extension channel + task pipeline + orchestrator + `ENABLE_EXTENSION_UI_TRADE_FLOW=true`; продавец в rollout allowlist.
2. Продавец залогинен на сайте и в **том же Chrome** на [steamcommunity.com](https://steamcommunity.com) под тем же Steam-аккаунтом.
3. Покупатель с валидным Trade URL покупает лот → заказ `WAITING_TRADE`, создаётся `TradeTask`.
4. Продавец на **Account** жмёт «Подключить расширение» → pair OK, extension читает `/auth/config`.
5. Расширение poll (active cadence / heartbeat hint): `ACKED` → открывает trade URL покупателя → `TRADE_PAGE_OPENED` / `OFFER_DRAFTED`.
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
| Другой Steam в Chrome | `STEAM_ACCOUNT_MISMATCH` | Войти в steamcommunity.com под аккаунтом продавца (CTA в popup / на заказе) или pair в нужном Chrome-профиле. |
| Инвентарь скрыт | `INVENTORY_PRIVATE` | Privacy → Inventory: Public. CTA в popup ведёт в настройки Steam. |
| Steam 429 / throttling | `INVENTORY_RATE_LIMITED` | Подождать 1–2 мин, «Проверить Steam» / «Повторить». Запасной ключ — только в «Дополнительно». |
| Нет входа в Steam | `STEAM_COOKIE_EXPIRED` | Войти на steamcommunity.com в этом Chrome под продавцом. |
| Сессия расширения умерла | `SESSION_REVOKED` | Account → «Подключить расширение» снова (popup показывает CTA). |
| Инвентарь не грузится (прочее) | `INVENTORY_NOT_LOADED` | Открыть steamcommunity.com, обновить страницу заказа. |
| Предмет не найден | `ITEM_MISSING` | Синхронизировать инвентарь на сайте; убедиться, что скин не продан/не в hold. |
| Несколько одинаковых скинов | `ITEM_MISMATCH` | Указать offer вручную или пересоздать лот с уникальным asset. |
| Guard не подтверждён | `CONFIRM_PENDING` | Открыть Steam Mobile → подтвердить trade offer. |

## Requirements

- Seller must be logged into [steamcommunity.com](https://steamcommunity.com) in the same browser
- Buyer must have a valid Trade URL in profile
- Extension rollout allowlist must include the seller (internal stage uses `EXTENSION_ROLLOUT_INTERNAL_USER_IDS`)
- Optional advanced: Steam inventory fallback key in extension popup → «Дополнительно» (support-only)

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
