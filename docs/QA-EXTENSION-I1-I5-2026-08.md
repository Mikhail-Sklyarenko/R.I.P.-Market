# QA — Chrome-расширение R.I.P Market (v0.6.26, I1–I5)

**Дата:** 27 августа 2026  
**Версия расширения:** `0.6.26`  
**Staging:** https://p2pcs.ru  
**Ветка / код:** `main` (после пуша этого пакета)  
**Связанные доки:** [QA-EXTENSION-TESTING.md](./QA-EXTENSION-TESTING.md) (базовый happy path), [browser-extension.md](./browser-extension.md), [extension-rollout-runbook.md](../backend/docs/extension-rollout-runbook.md)

---

## 0. Кратко: что тестировать в этом пакете

Продуктовый пакет расширения + сайт вокруг сделок:

| Код | Название | Суть для QA |
|-----|----------|-------------|
| I1 | Extension-aware buy/sell | На сайте понятные подсказки про расширение при покупке/продаже/на заказе |
| I2 | Pricing API | В Steam-инвентаре цены/«вам ~$» с сервера |
| I3 | Listing auth | Выставить / снять лот **из расширения** без JWT сайта |
| I4 | Adaptive poll | Активная сделка → чаще опрос; idle → спокойнее; `new_deal` notify |
| I5 | Feature flags | Три рубильника: inventory / guided buyer / quiet notify |

**Жёсткое правило продукта:** расширение **никогда** само не жмёт Accept / Steam Guard.

---

## 1. Что нужно тестировщику

| Роль | Где | Зачем |
|------|-----|--------|
| **Продавец** | Chrome (обычное окно) + p2pcs.ru + steamcommunity | Pair, лоты, авто-оффер, inventory overlay |
| **Покупатель** | Chrome инкогнито (или другой профиль) | Покупка, accept wizard, guided overlay |
| **Admin** (по возможности) | Mock Admin / роль admin | `/admin/extension`, complete trade на staging |

**Софт:** только **Google Chrome**. Steam Mobile у продавца (Guard).

**Важно:** продавец — **один** профиль Chrome: сайт + Steam + расширение под **одним** SteamID.

---

## 2. Установка расширения (обязательно 0.6.26)

### Вариант A — из репозитория (для этой сборки)

```bash
git pull
cd browser-extension && npm ci && npm run build
```

Chrome → `chrome://extensions` → Режим разработчика → **Загрузить распакованное** → папка:

`browser-extension/dist`

Проверьте на карточке расширения:

- название: **R.I.P Market Trade Assistant**
- версия: **0.6.26**
- ID: **`gmmlnkjdbcoojbhndjcfehojknjamaoj`**

После обновления кода нажимайте **Обновить** на карточке расширения.

### Вариант B — zip с GitHub Releases

Когда появится релиз `browser-extension-v0.6.26` — скачать zip, распаковать, загрузить папку **`dist`** (как в [QA-EXTENSION-TESTING.md](./QA-EXTENSION-TESTING.md)).

> Пока релиза нет — используйте **вариант A**.

---

## 3. Подключение (pair)

1. https://p2pcs.ru/login → Steam.
2. В том же Chrome — вход на steamcommunity.com тем же аккаунтом.
3. p2pcs.ru → **Аккаунт** → Trade URL сохранён.
4. Блок расширения → **Подключить расширение**.
5. **Ожидание:** «Подключено»; popup расширения — paired, без красного mismatch.

| Проблема | Действие |
|----------|----------|
| Нет кнопки pair | Расширение не установлено / неверный ID / выключено |
| Steam mismatch | Выйти из Steam в Chrome, войти нужным аккаунтом, pair снова |
| Зелёный пустой экран на OpenID | Обновить страницу / инкогнито / без VPN; это Steam, не сайт |

---

## 4. Чеклисты по блокам

Отмечайте Pass / Fail / Blocked. К Fail — скрин + версия расширения + роль.

### A. Pair + popup (база)

| # | Шаг | Ожидание |
|---|-----|----------|
| A1 | Pair с Аккаунта | Connected |
| A2 | Popup: home | Полоска связи, версия 0.6.26 |
| A3 | Popup: «Покупки» / «Продажи» | Списки или спокойный empty state |
| A4 | «Скопировать отчёт для поддержки» | Текст в буфере; открывается `/support` с темой extension |
| A5 | Двухминутный onboarding (если первый раз) | 4 шага, можно «Позже» |

### B. I1 — сайт знает про расширение

| # | Шаг | Ожидание |
|---|-----|----------|
| B1 | Карточка покупки лота / предмета (не paired) | Мягкая подсказка «установите / подключите» — **не** блокирует покупку |
| B2 | Inventory / sell на сайте | Soft hint про расширение |
| B3 | Заказ `WAITING_TRADE`, продавец paired | Прогресс задачи / ready hint, deep link на оффер когда есть |
| B4 | Заказ buyer, оффер есть, расширение не подключено | CTA подключить для безопасного accept |
| B5 | Mismatch на заказе | Баннер «не принимайте»; без CTA «открыть оффер» как primary accept |

### C. I2 / I3 — инвентарь Steam + листинг

Предварительно: pair OK, Steam → инвентарь CS2 (`#730_2`).

| # | Шаг | Ожидание |
|---|-----|----------|
| C1 | Открыть CS2 inventory | Host bar R.I.P (не ломает сетку Steam) |
| C2 | Карточки скинов | Float / badges / цена R.I.P / «вам ~$» |
| C3 | «Продать на R.I.P» → подтвердить | Лот создаётся; toast / ссылка на объявления |
| C4 | Уже выставленный → «Управлять» | Смена цены / снять с продажи |
| C5 | Множественная продажа (если есть) | Выбор → выставить batch |
| C6 | Trade-lock / not tradable | Продать **заблокировано** с понятной причиной |
| C7 | Без pair | Soft gate на Аккаунт, не падает страница |

### D. Сделка продавец → покупатель (happy path)

Базовый сценарий как в [QA-EXTENSION-TESTING.md](./QA-EXTENSION-TESTING.md) §5–6.

| # | Шаг | Ожидание |
|---|-----|----------|
| D1 | Buyer покупает лот seller | Заказ `WAITING_TRADE`, у seller появляется task |
| D2 | Extension шлёт оффер | Фазы на заказе двигаются; Steam Guard — **вручную** |
| D3 | Buyer: wizard на заказе | 3 шага; deep link на **этот** `tradeoffer/{id}` |
| D4 | Steam offer page | Overlay: статус verified / mismatch; **нет** авто-Accept |
| D5 | Список `/tradeoffers/` | Бейджи «Сделка R.I.P» / «Не наша» / mismatch; фильтр «Только R.I.P» |
| D6 | Accept в Steam вручную | Статус на сайте обновляется; post-accept trust copy |

### E. I4 — poll / уведомления

| # | Шаг | Ожидание |
|---|-----|----------|
| E1 | Нет активных сделок | Poll спокойный (не «дергается» каждую секунду) |
| E2 | Появилась новая продажа / задача | Popup / quiet `new_deal` (если quiet ON); poll активнее |
| E3 | Quiet notify | Только при смене статуса (Guard / Accept / Mismatch / new_deal), без спама каждый poll |
| E4 | Popup → Дополнительно → тихие уведомления | Toggle; mute/unmute сделки |

### F. I5 — feature flags (после деплоя backend)

Флаги в `GET /api/v1/auth/config` → `extension.*`.  
По умолчанию (env **не** задан) = **ON**. Kill = `=false` + restart API.

| Flag env | Поле в config | Что должно пропасть при OFF |
|----------|---------------|-----------------------------|
| `ENABLE_EXTENSION_GUIDED_BUYER` | `extensionGuidedBuyerEnabled` | Wizard на сайте; accept-assist на Steam. **Остаются:** бейджи, mismatch overlay |
| `ENABLE_EXTENSION_QUIET_NOTIFICATIONS` | `extensionQuietNotificationsEnabled` | Chrome notify + блок quiet в popup |
| `ENABLE_EXTENSION_INVENTORY_LAYER` | `extensionInventoryLayerEnabled` | Overlay в Steam inventory |

**Порядок kill в инциденте:** guided → quiet → inventory (последним).

| # | Шаг | Ожидание |
|---|-----|----------|
| F1 | Все unset | Три поля `true` в `/auth/config`; Admin → Extension Ops → snapshot ON |
| F2 | Guided=false, heartbeat ~1–2 мин | Wizard/assist OFF; badges/mismatch ON; inventory/quiet ON |
| F3 | Quiet=false | Нет notify; секция popup скрыта |
| F4 | Inventory=false + F5 inventory | Нет host bar / sell overlay |
| F5 | Вернуть флаги (удалить false) | После heartbeat всё снова ON **без** re-pair |

> Если staging ещё **без** деплоя I5 — F-блок отметить Blocked (backend), A–E всё равно гонять.

### G. Негативы / безопасность

| # | Шаг | Ожидание |
|---|-----|----------|
| G1 | Чужой / не наш offer | Панель «Не наша сделка — не принимайте» |
| G2 | Mismatch item | Блок accept; support CTA |
| G3 | Другой Steam в Chrome | Mismatch в popup; нет ложной «всё ок» |
| G4 | Расширение никогда не жмёт Accept/Guard | Визуально и по поведению — только подсказки |
| G5 | Revoke / disconnect | Pair сбрасывается; listing из overlay требует pair снова |

### H. Admin (если есть доступ)

| # | Шаг | Ожидание |
|---|-----|----------|
| H1 | `/admin/extension` | KPI gates, alerts, fail reasons |
| H2 | Feature flags snapshot | Видны I5 + UI/ack флаги |
| H3 | Observability выключена | Понятное сообщение, не пустая 500 |

---

## 5. Критерии приёмки пакета

**Pass пакета**, если:

1. Pair стабилен на staging с `0.6.26`.
2. Happy path сделки (D) проходит без авто-Accept/Guard.
3. Inventory overlay (C) создаёт/управляет лотом из Steam.
4. Buyer wizard + Steam overlay (D3–D5) помогают и блокируют mismatch.
5. Quiet notify не спамит (E).
6. I5 (F) — после деплоя backend: независимые kill работают; без деплоя — Blocked только F.

**Fail**, если:

- авто-клик Accept/Guard;
- лот создаётся «в никуда» / 401 без понятной ошибки после pair;
- mismatch не блокирует;
- pair ломается после обычного F5 / poll.

---

## 6. Как сдать баг

В тикет / чат разработчику:

1. Версия расширения (`0.6.26` / другая).
2. Роль: seller / buyer.
3. URL заказа / Steam page.
4. Шаг чеклиста (например `C3`, `F2`).
5. Скрин + Console (F12) на сайте и на Steam.
6. Текст из «Скопировать отчёт для поддержки» (если есть).

---

## 7. Smoke за 15 минут (минимум)

1. Установить `0.6.26` → pair.  
2. CS2 inventory → виден overlay → trial «Продать» (можно снять лот после).  
3. Buyer покупает → seller Guard вручную → buyer wizard + overlay → Accept вручную.  
4. Popup: сделка видна, support pack копируется.  
5. (Если backend I5) один kill guided=false → wizard пропал, badges остались.

Этого достаточно, чтобы сказать «пакет живой»; полный прогон — §4 A–H.
