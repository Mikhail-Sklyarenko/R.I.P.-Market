# Отчёт для тестировщика — R.I.P. Market

**Период:** 14–23 августа 2026 (последние ~3 недели активной разработки)  
**Ветка:** `main`  
**Объём:** ~61 коммит, основной релизный пакет + продуктовый UX  
**Staging:** https://p2pcs.ru (см. также [QA-STAGING-p2pcs.md](./QA-STAGING-p2pcs.md))  
**Дата отчёта:** 24 августа 2026

---

## 1. Кратко: что изменилось

За три недели закрыт крупный backlog и доведён до «продуктового» UX:

| Область | Суть |
|---------|------|
| **Buy requests** | Заявки на покупку с резервом баланса, wear, quantity; публичный стакан |
| **Каталог** | Cases, multi-select фильтры, «В наличии», сортировка, scroll restore, кэш |
| **Карточка предмета / лота** | Purchase-ready страница, order book, trust/float/inspect, mobile dock |
| **Платежи** | NORTH checkout (TRC20 / BEP20 / ERC20), отображение баланса в **USD** |
| **Инвентарь / продажа** | Фоновый sync, Steam-цены, onboarding первой продажи |
| **Кабинет / сделки / саппорт** | Next-step UX, empty states, тикеты с deal ID и Steam-gate |
| **Антискам / SEO** | SteamID на ордерах, item slugs + canonical meta |

Ниже — что тестировать и как.

---

## 2. Новые функции (реализовано)

### 2.1. Buy requests (заявки на покупку)

**Что сделано**

- Создание заявки с max price, quantity, фильтром wear.
- Резерв (hold) средств на балансе при создании; preview резерва в UI.
- Истечение / отмена заявок; список «Мои заявки».
- На странице предмета: панель создания + список активных заявок (своих).
- Публичный **order book**: спрос (buy) и предложения (sell) без раскрытия личностей.
- Свои уровни цены в стакане подсвечиваются; продавцу не показывается лишний sell-hint на своей заявке.
- Mobile: sticky purchase dock для CTA заявки.

**Как тестировать**

1. Войти через Steam (или mock buyer на local).
2. Открыть предмет без лота / с лотами → блок «Заявка на покупку» (`item-buy-request-panel`).
3. Указать цену, wear, quantity → проверить `item-buy-request-reserve-preview` (сумма резерва = цена × qty).
4. При нехватке баланса — ссылка на депозит (`item-buy-request-deposit-link`).
5. Создать заявку → баланс уменьшается на hold; заявка видна в активных и в `/buy-requests` (или аналог «Мои заявки»).
6. Открыть ту же страницу гостем / другим юзером → в order book есть уровень спроса, **без** ника/SteamID.
7. Создать вторую заявку своей ценой → свой уровень в стакане выделен.
8. Отменить заявку → hold возвращается.
9. E2E: `frontend/e2e/buy-request-flow.spec.ts`.

**Ожидание:** нельзя создать заявку без Trade URL / при нулевом балансе без понятного CTA; чужие заявки не раскрывают продавца/покупателя.

---

### 2.2. Публичный order book на item page

**Что сделано**

- Агрегированный стакан: buy demand + top sell offers.
- Всегда полный стакан заявок (не «только чужие»).

**Как тестировать**

1. Предмет с несколькими лотами и ≥1 buy request.
2. Проверить блок стакана: уровни цен, объёмы, сортировка (обычно лучше сверху).
3. Нет имён пользователей / аватаров в стакане.
4. После отмены лота / заявки стакан обновляется после reload или навигации.

---

### 2.3. Каталог: Cases, фильтры, «В наличии»

**Что сделано**

- Категория **Cases** (кейсы) как first-class tab; в т.ч. Armory terminals.
- Multi-select чекбоксы моделей внутри категории + счётчики.
- Сброс последнего чекбокса → снова весь таб категории (не «Select all»).
- Фильтр / сортировка **«В наличии»** (только предметы с активными лотами) — в themed sort dropdown.
- Popular shelf скрывается при стандартных сортировках (не Popular).
- Pistols: Glock-18 и USP-S первыми в списке.
- Иконки Cases / Gloves обновлены под CS2-силуэты.

**Как тестировать**

| # | Шаги | Ожидание |
|---|------|----------|
| C1 | Каталог → вкладка Cases | Есть кейсы и Armory terminals; превью не «пустышка» |
| C2 | Rifles → отметить 2 модели | Список только по выбранным; счётчики в фильтре |
| C3 | Снять все модели по одной | После последней — весь таб снова, без принудительного Select all |
| C4 | Sort → «В наличии» | Только предметы с лотами; цена/сортировка согласованы с тем, что видно в карточке |
| C5 | Sort → Price / Name (не Popular) | Блок Popular shelf **скрыт** |
| C6 | Pistols → список моделей | Glock-18, USP-S сверху |
| C7 | Иконки Cases / Gloves в табах | Читаемы на ~18px, без артефактов |

E2E: `catalog-filters.spec.ts`.

---

### 2.4. Навигация каталога, slug, scroll restore, кэш

**Что сделано**

- Открытие предметов по **имени/slug** (`/items/...`), SEO canonical meta.
- Возврат в каталог на ту же позицию / тот же набор результатов (scroll + card into view).
- Session cache каталога и инвентаря — мгновенный restore при назад/вперёд.
- Load-more / page size 96 в buy-flow каталога.
- Фикс загрузки каталога под React Strict Mode.

**Как тестировать**

1. Отфильтровать каталог → пролистать вниз → открыть карточку → «Назад».
2. **Ожидание:** те же фильтры, тот же scroll, карточка в зоне видимости (или рядом).
3. URL предмета — человекочитаемый slug; в `<head>` есть title/canonical (DevTools → Elements).
4. Повторный заход в каталог — сетка появляется сразу (из кэша), без долгого пустого экрана.
5. E2E: `catalog-return.spec.ts`, `catalog-item-slugs.spec.ts`, `catalog-load-more.spec.ts`.

---

### 2.5. Страница предмета / лота (покупка)

**Что сделано**

- Если один листинг — **purchase-ready** item page (покупка без лишних кликов).
- Покупка прямо с листинга; продавец может опираться на Steam-цену при выставлении.
- Карточка покупки: цена сверху, баланс, CTA; trust panel (escrow / flow).
- Float: показ с fallback на asset data; подсказка, если float отсутствует.
- Inspect: честное различие reliable vs fallback; фикс CS2 inspect (`propid:6` Item Certificate → корректные ссылки / classic S/A/D).
- Убраны дублирующие тексты вокруг CTA.
- Mobile: **sticky purchase dock** + таблицы продавца как card-stack.

**Как тестировать**

| # | Шаги | Ожидание |
|---|------|----------|
| L1 | Предмет с ровно 1 активным лотом | Сразу понятный buy CTA, без «пустого» списка лотов |
| L2 | Купить (баланс ≥ цены) | Checkout / создание ордера без лишних экранов |
| L3 | Баланс < цены | CTA ведёт к пополнению (deposit-first), сумма shortfall подставляется |
| L4 | Float на лоте | Число float видно; если нет — спокойный hint, не «сломано» |
| L5 | Inspect in-game | Ссылка открывается / копируется; нет шаблона с `%propid%` / placeholder |
| L6 | Mobile ≤ 390px | Sticky dock с ценой и CTA всегда доступен; контент не перекрыт виджетами |
| L7 | Trust panel | Есть понятный текст про escrow / шаги сделки |

E2E: `lot-page.spec.ts`, `checkout-smoke.spec.ts`.

---

### 2.6. NORTH payments + USD в UI

**Что сделано**

- Интеграция **NORTH**: сумма + сеть (trc20 / bep20 / erc20) → redirect на checkout → webhook `deposit.credited` → кредит **`creditUsd`**.
- Балансы и цены в маркетплейсе показываются как **USD**; USDT остаётся на платёжных рельсах (checkout).
- Кошелёк: deposit-first при нехватке на покупку; mock/test deposit демотирован.
- Скрипты: `scripts/enable-north-payments-staging.sh`, `verify-payments-readiness.sh`, `smoke-north-webhook.sh`.
- Док: [payments-north.md](./payments-north.md).

**Как тестировать (зависит от env staging)**

**A. Если `PAYMENT_PROVIDER=north`**

1. `/wallet` → Deposit → выбрать сумму и сеть → «Оплатить».
2. Редирект на NORTH `/pay` → оплата (тестовая по договорённости с партнёром).
3. Возврат на `/wallet?tab=deposit&fromCheckout=1` → баланс растёт на `creditUsd`.
4. Повторный тот же webhook не должен удваивать баланс (ops/smoke script).
5. Проверить `/auth/config`: `paymentProvider=north`, `depositMode=checkout`.

**B. Если ещё mock deposit**

1. Недостаток баланса при покупке → Wallet с prefill суммы.
2. Цены в каталоге / шапке — подпись **USD** (не «USDT» у ledger).
3. На экране депозита формулировки про USDT/сеть допустимы.

**C. Негатив**

- Неверный `paymentMethod` → ошибка, без кредита.
- Создание checkout **не** кредитует баланс до webhook.

---

### 2.7. Инвентарь и первая продажа

**Что сделано**

- Инвентарь остаётся на экране во время фонового Steam refresh.
- Steam price banners не блокируют листинг больших инвентарей.
- Onboarding первой продажи: чеклист, empty states (private / sync / empty).
- Модалка листинга: price-first карточка.
- Подтверждение успешного листинга на My Lots.

**Как тестировать**

1. Seller Steam → Inventory: при sync UI не «белый экран», старые ассеты видны.
2. Инвентарь private в Steam → понятный empty/guidance + что сделать.
3. Пустой / нет tradable → CTA и объяснение, не сырой «No items».
4. Выставить лот с подсказкой Steam-цены → лот в My Lots, success-state.
5. E2E: `inventory-sync.spec.ts`, `sell-flow.spec.ts`.

---

### 2.8. Сделки, аккаунт, саппорт, empty states

**Что сделано**

- Deals: action-oriented cards вместо «таблицы»; на ордере панель **«что делать сейчас»**.
- Account: trader-focused кабинет.
- Support: Steam gate, опциональный deal ID, topic guidance, шорткаты к deals/wallet/FAQ.
- Admin: страница support tickets.
- Глобальные empty states с reset-фильтрами и next-step CTA (каталог, deals, wallet, notifications).
- Anti-scam: SteamID контрагента на ордере (`TradeCounterpartyCard`).
- Sell routes защищены auth gate (`SellProtectedRoute`).

**Как тестировать**

| # | Область | Шаги | Ожидание |
|---|---------|------|----------|
| D1 | Deals | Пустой список / активная сделка | Empty с CTA **или** карточка с next step |
| D2 | Order | Открыть сделку | Панель «что делать»; SteamID контрагента виден |
| D3 | Support | Не залогинен / без Steam | Gate с объяснением |
| D4 | Support | Из ордера → тикет | Deal ID подставляется / предлагается |
| D5 | Admin | `/admin` support tickets | Список тикетов, можно открыть |
| D6 | Guest → Sell | Переход на sell без сессии | Auth required, не 500 |
| D7 | Empty catalog filter | Фильтр без результатов | Текст «почему пусто» + сброс фильтров |

E2E: `ops-support-tickets.spec.ts`, `nav-routes.spec.ts`.

---

## 3. Исправления (багфиксы)

| Фикс | Симптом до | Как проверить |
|------|------------|---------------|
| Catalog return / scroll | После лота — «прыжок» в начало | См. §2.4 |
| Category checkboxes | Clear → принудительный Select all | См. §2.3 C3 |
| In-stock + price sort / cache | Фильтр не совпадал с витриной | §2.3 C4 после смены лотов |
| Strict Mode catalog load | Дубли / пустая сетка в dev | Reload каталога 3× подряд |
| Steam price banners | Большой инвентарь нельзя листить | §2.7 |
| Float на активных лотах | Float пропадал | §2.5 L4 |
| CS2 inspect `propid:6` | Битые in-game ссылки | §2.5 L5 |
| Terminal weapon backfill (Prisma 7) | Скрипт backfill падал | Ops: backfill terminals при деплое Cases |
| E2E helpers (trade URL, buy request, reserve) | Красные CI e2e | `cd frontend && npm run test:e2e` |
| Popular shelf при sort | Мешал при Price/Name | §2.3 C5 |
| Lot action buttons / duplicate copy | Двойные CTA / сломанные кнопки | §2.5 визуально + клик Buy/Cancel |

---

## 4. Регрессионный smoke (обязательный минимум)

Прогнать на staging после деплоя (Steam-аккаунт с публичным инвентарем + баланс):

1. **Каталог** — вкладки, Cases, фильтры, «В наличии», sort.
2. **Предмет** — order book, buy request create/cancel.
3. **Лот** — float, inspect, buy CTA (desktop + mobile).
4. **Покупка** — hold баланса → ордер → next-step на сделке.
5. **Продажа** — inventory sync → list → видно в каталоге / My Lots.
6. **Кошелёк** — подписи USD; депозит (NORTH или mock — по env).
7. **Аккаунт** — Trade URL save; кабинет без поломок layout.
8. **Support** — создать тикет с deal ID (если есть ордер).
9. **Назад из лота в каталог** — позиция сохранена.

Автоматизация (local/CI):

```bash
cd frontend && npm run test:e2e
```

Ключевые новые/обновлённые спеки: `buy-request-flow`, `catalog-filters`, `catalog-item-slugs`, `catalog-load-more`, `catalog-return`, `ops-support-tickets`, `lot-page`, `checkout-smoke`.

---

## 5. Матрица приоритетов QA

| Приоритет | Зона | Почему |
|-----------|------|--------|
| **P0** | Buy request + hold/refund | Деньги пользователя |
| **P0** | Покупка лота + wallet shortfall → deposit | Конверсия / деньги |
| **P0** | NORTH checkout + webhook idempotency (если включено) | Реальные платежи |
| **P0** | Inspect / float honesty | Доверие к лоту |
| **P1** | Order book корректность и приватность | Рыночная механика |
| **P1** | Catalog in-stock + filters + return | Основной browse |
| **P1** | Cases tab completeness | Новый ассортимент |
| **P2** | Empty states / deals next-step / support UX | Полировка |
| **P2** | Mobile sticky dock | Mobile conversion |
| **P2** | Иконки категорий | Визуал |

---

## 6. Известные ограничения / на что обратить внимание

- **NORTH** на staging может быть ещё не cutover — уточнить у разработчика `PAYMENT_PROVIDER` перед тестом депозитов. Док и gate: [payments-north.md](./payments-north.md), [REAL-MONEY-ROLLOUT.md](./REAL-MONEY-ROLLOUT.md).
- Завершение реальной Steam-сделки по-прежнему может идти через mock admin / extension — см. [QA-STAGING-p2pcs.md](./QA-STAGING-p2pcs.md).
- Mock Buyer/Seller — для e2e; ручной QA на p2pcs.ru — через **Steam**.
- UI-строки: проверять **RU и EN** (много правок i18n за период).

---

## 7. Чеклист сдачи тестировщику (копипаст)

```
[ ] Cases tab + Armory terminals
[ ] Category multi-select / clear last = whole tab
[ ] Sort «В наличии» совпадает с витриной
[ ] Catalog return + scroll restore
[ ] Item slug URL + meta
[ ] Order book: buy+sell, без PII; свой уровень highlight
[ ] Buy request: create, reserve preview, cancel, hold return
[ ] Single-listing purchase-ready item page
[ ] Lot: float, inspect (нет placeholder), trust, mobile dock
[ ] Insufficient balance → wallet prefill deposit
[ ] Prices/balances labeled USD
[ ] NORTH deposit OR mock deposit (по env)
[ ] Inventory stays visible during sync; first-sale onboarding
[ ] Deals next-step + SteamID counterparty
[ ] Support ticket + deal ID + Steam gate
[ ] Empty states с CTA на catalog/deals/wallet
[ ] RU/EN smoke ключевых экранов
[ ] E2E green (опционально local)
```

---

## 8. Контакты при блокерах

При баге приложить: URL, роль (Steam / admin), шаги, скрин, Console (F12), Network на упавший `/api/v1/...`, время UTC.

Базовый runbook staging: [QA-STAGING-p2pcs.md](./QA-STAGING-p2pcs.md).
