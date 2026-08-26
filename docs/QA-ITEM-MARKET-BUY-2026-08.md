# Отчёт для тестировщика — Item Market (taxonomy + buy on item page)

**Дата:** 26 августа 2026  
**Staging:** https://p2pcs.ru  
**Область:** страница предмета (`/catalog/items/...`), стакан, покупка без hop на лот  

---

## 1. Кратко: что изменилось

Сделали страницу предмета **рынком**, а не «каталогом ссылок на лоты».

| Тип предмета | Поведение |
|--------------|-----------|
| **Fungible** (Case, Terminal, Key, Sticker и т.п.) | Нет Float/стикеров в UI. Стакан = **цена + количество**. Кнопка **«Купить»** прямо на странице предмета (лучший лот). Без перехода на `/lots/...`. |
| **Differentiated** (скины с wear/float) | Стакан = цена + qty. Список офферов **выбираемый**: клик по строке → sidebar обновляется → **«Купить»**. «Подробнее» ведёт на страницу лота (опционально). |

Таксономия: `fungible` vs `differentiated` (weapon / wear / float).

---

## 2. Что тестировать

### A. Кейс / fungible (Gallery Case и аналоги)

1. Каталог → Cases → открыть предмет с **несколькими** лотами (comparison mode).
2. **Ожидание — нет Float:**
   - в стакане sells нет колонки Float;
   - нет таблицы офферов с Float / сортировкой Float;
   - нет пустых «—» по float.
3. **Ожидание — стакан:**
   - сторона «Продают»: колонки **Цена** и **Кол-во**;
   - одинаковые цены схлопнуты (например 3 лота по $1.00 → qty = 3).
4. **Ожидание — покупка:**
   - справа карточка покупки (`item-market-purchase-card`);
   - primary CTA: **«Купить сейчас»** / login (`item-buy-best`), **не** «Открыть лучшее предложение»;
   - после покупки → `/orders/:id`;
   - URL остаётся на item page до создания ордера (нет hop на lot).
5. Own lot / недостаточный баланс — те же блокировки, что на странице лота.

**Негатив:** предмет с 0 лотов → режим заявки (buy request), не comparison.

---

### B. Скин / differentiated (например AWP / Glock с wear)

1. Открыть предмет с **≥2** активными лотами и float.
2. **Ожидание — Float:**
   - в списке предложений есть колонка Float (+ сорт Float ↑/↓);
   - стикеры показываются, если есть.
3. **Ожидание — выбор:**
   - клик по строке или «Выбрать» → строка selected;
   - sidebar: цена/продавец выбранного лота (`item.selectedOffer`);
   - **«Купить»** создаёт ордер **выбранного** `lotId` (не обязательно cheapest, если выбрали другой).
4. Ссылка «Подробнее» / «Подробнее о лоте» → `/lots/:id` работает.
5. Смена сортировки не должна ломать selection (если лот ещё в списке — остаётся выбранным).

---

### C. Регрессии

| # | Сценарий | Ожидание |
|---|----------|----------|
| R1 | Предмет с **1** лотом | single-listing: покупка как раньше через `LotListingDetail` / `buy-lot-button` |
| R2 | Прямой URL `/lots/:id` | lot page жива, buy работает |
| R3 | Buy request (0 лотов) | панель заявки + compact стакан |
| R4 | Mobile | sticky purchase dock на item page (`item-mobile-purchase-dock`) |
| R5 | E2E-критичные id | на **lot page** по-прежнему `buy-lot-button`; на **item comparison** — `item-buy-best` |

---

## 3. Быстрый smoke на staging

```text
1) https://p2pcs.ru → Cases → Gallery Case (или любой case с ≥2 лотами)
   → нет Float, стакан цена/qty, Купить на месте

2) Любой скин с ≥2 лотами и float
   → выбрать 2-й оффер → Купить → ордер на этот лот

3) Открыть /lots/<id> напрямую → Купить (buy-lot-button) ок
```

---

## 4. Testids (для авто / DevTools)

| Элемент | testid |
|---------|--------|
| Карточка покупки на item | `item-market-purchase-card` |
| CTA покупки на item | `item-buy-best` |
| Mobile dock | `item-mobile-purchase-dock` |
| Стакан asks | `item-order-book-asks-table` (`data-asks-mode="levels"`) |
| Уровень цены | `item-order-book-ask-level-<priceMinor>` |
| Список офферов | `item-offers-list` (`data-selectable`, `data-show-float`) |
| Выбор оффера | `item-offer-select-<lotId>` |
| Lot page buy | `buy-lot-button` |

---

## 5. Известные ограничения (не баги этого релиза)

- Покупка «лучшего» на клиенте берёт cheapest из загруженного списка (не отдельный atomic `buy-best` API) — при гонке возможен «лот уже куплен».
- Паттерн-пикер / price notify / depth-chart — **не** в этом релизе.
- Страница лота сохранена для deep link и «подробнее».

---

## 6. Связанные файлы (для разработчика)

- `frontend/src/utils/item-market-taxonomy.ts`
- `frontend/src/components/ItemMarketPurchaseCard.tsx`
- `frontend/src/hooks/useLotPurchase.ts`
- `backend/src/order-book/order-book.util.ts` (`asksLevels`)
