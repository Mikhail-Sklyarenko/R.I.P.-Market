# R.I.P. Market — руководство для QA

Документ для ручного тестирования staging/dev окружения CS2 P2P маркетплейса.

## Окружение staging

### Backend (`backend/.env`)

```env
DATABASE_URL=postgresql://...
JWT_SECRET=<уникальный-секрет-не-dev>
AUTH_PROVIDER=mock
INVENTORY_PROVIDER=mock
TRADE_PROVIDER=mock
ENABLE_MOCK_TRADE=true
ENABLE_MOCK_DEPOSIT=true
FRONTEND_ORIGIN=https://staging.example.com
```

### Frontend (`frontend/.env`)

```env
VITE_API_BASE_URL=https://api-staging.example.com/api/v1
VITE_ENABLE_MOCK_TRADE=false
VITE_STAGING=true
```

| Переменная | Staging | Local dev |
|------------|---------|-----------|
| `JWT_SECRET` | Обязательно задать | `dev-jwt-secret` |
| `AUTH_PROVIDER` | `mock` | `mock` |
| `ENABLE_MOCK_TRADE` (backend) | `true` (для admin API) | `true` |
| `VITE_ENABLE_MOCK_TRADE` | `false` | `true` |
| `VITE_STAGING` | `true` | не задавать |

На staging **dev-панели** (mock deposit, mock trade на странице сделки) **скрыты для buyer/seller**. Admin видит mock-trade только если залогинен как ADMIN.

### Mock login

Страница `/login` → вкладки ролей:

| Роль | Кнопка | После входа |
|------|--------|-------------|
| Buyer | `login-buyer` | `/catalog` |
| Seller | `login-seller` | `/sell/inventory` |
| Admin | `login-admin` | `/admin/orders` |

Гость может открыть `/catalog` и карточку лота без авторизации.

---

## Smoke checklist (автоматизирован в Playwright)

- [ ] Каталог → покупка → mock success → `COMPLETED`
- [ ] Продажа → листинг → покупка другим пользователем → завершение
- [ ] Dispute → admin resolve
- [ ] Кошелёк: hold при покупке, возврат при отмене
- [ ] Каталог: вкладки категорий и счётчик `catalog-total`
- [ ] Карточка лота: wear-bar, похожие лоты, CTA покупки
- [ ] Аккаунт: сохранение Trade URL

Запуск: `cd frontend && npm run test:e2e`

---

## Ручные тест-кейсы

### TC-01. Гостевой каталог

**Шаги:** Открыть `/catalog` без логина.  
**Ожидание:** Сетка лотов видна; клик «Открыть» открывает `/lots/:id`; кнопка «Купить сейчас» / «Войти для покупки» ведёт на checkout или логин.

### TC-02. Навигация buyer

**Шаги:** Войти как Buyer. Проверить шапку: Каталог, Мои сделки, Кошелёк, баланс в `header-wallet-balance`.  
**Ожидание:** Пункта «Продать» нет. Переходы работают.

### TC-03. Навигация seller

**Шаги:** Войти как Seller.  
**Ожидание:** В шапке есть «Продать» → `/sell/inventory`, «Мои лоты» → `/sell/my-lots`. Также доступны Мои сделки и Кошелёк.

### TC-04. Выставление лота

**Шаги:** Seller → Инвентарь → «Выставить» → цена $1000 → Submit.  
**Ожидание:** Редирект на `/sell/my-lots`; строка со статусом «Активен»; превью комиссии 5% / выплата 95%.

### TC-05. Покупка через checkout

**Шаги:** Buyer → каталог → лот → «Купить сейчас» → `/lots/:id/checkout`.  
**Ожидание:** Превью цены, кошелька; при нехватке средств — ссылка на депозит и disabled CTA.  
**Шаги:** Mock deposit $2000 → вернуться → «Подтвердить покупку».  
**Ожидание:** Редирект на `/orders/:id`, статус `WAITING_TRADE`, stepper на экране сделки.

### TC-06. Mock trade success (dev only)

**Предусловие:** `VITE_ENABLE_MOCK_TRADE=true`, не staging.  
**Шаги:** На сделке `WAITING_TRADE` нажать mock success.  
**Ожидание:** Статус `COMPLETED`, сообщение об успехе, у продавца выплата ~95% на кошелёк.

### TC-07. Отмена покупателем

**Шаги:** Создать сделку `WAITING_TRADE` → «Отменить сделку».  
**Ожидание:** Статус `CANCELED`; лот снова `ACTIVE` в каталоге; hold возвращён (кошелёк: hold $0, available восстановлен).

### TC-08. Кошелёк: hold и refund

**Шаги:** До покупки запомнить Available/Hold. Купить лот. Открыть `/wallet`.  
**Ожидание:** Hold = сумма сделки, Available уменьшился. Блок «Что такое hold?» виден.  
**Шаги:** Отменить сделку.  
**Ожидание:** Hold = $0, Available как до резерва (минус комиссии нет при отмене).

### TC-09. Seller видит сделку

**Шаги:** После покупки лота seller'а — войти как Seller → Мои сделки.  
**Ожидание:** Строка `WAITING_TRADE`, роль «Продавец», подсказка о передаче в Steam. Mock-trade панели **нет**.

### TC-10. Уведомления

**Шаги:** Завершить сделку (mock success). Открыть колокольчик / `/notifications`.  
**Ожидание:** Событие о завершении сделки. Фильтр «Требуют действия» и «Сделки» работают.

### TC-11. Admin: список заказов

**Шаги:** Войти как Admin → `/admin/orders`.  
**Ожидание:** Сводка (disputes, waiting trade), фильтры, подсветка строк `DISPUTE` / `WAITING_TRADE`.

### TC-12. Admin: dispute open и resolve

**Шаги:** Сделка `WAITING_TRADE` → admin order card → reason → Open dispute → confirm modal.  
**Ожидание:** Статус `DISPUTE`, timeline содержит переход.  
**Шаги:** Resolve for buyer / seller с reason.  
**Ожидание:** `FAILED` (buyer) или `COMPLETED` (seller); audit log с reason.

### TC-13. Admin: блокировка лота

**Шаги:** `/admin/lots` → ACTIVE лот → Block → reason в modal.  
**Ожидание:** Статус `BLOCKED`, запись в audit. Unblock возвращает `ACTIVE`.

### TC-14. Staging: dev-панели скрыты

**Предусловие:** `VITE_STAGING=true`, buyer/seller login.  
**Шаги:** Открыть `/wallet` и сделку `WAITING_TRADE`.  
**Ожидание:** Формы mock deposit и mock trade **не отображаются**. Admin при необходимости использует ops console.

### TC-15. Admin: restrict user

**Шаги:** `/admin/users` → Details → Suspend с reason.  
**Ожидание:** Статус `SUSPENDED`, audit log. Пользователь не может создать лот/заказ. Unrestrict возвращает `ACTIVE`.

### TC-16. Аккаунт: Trade URL

**Шаги:** Buyer → `/account` → вставить валидную ссылку Steam trade offer → «Сохранить ссылку».  
**Ожидание:** Сообщение об успехе; чеклист готовности показывает «Ссылка на обмен указана»; `GET /users/me` возвращает сохранённый URL.  
**Негатив:** Пустое поле или невалидный URL → ошибка валидации на форме.

### TC-17. Seller: trade offer (ручной Steam P2P)

**Предусловие:** У buyer и seller указаны Trade URL в аккаунте; сделка в `WAITING_TRADE`.  
**Шаги (seller):** Открыть `/orders/:id` → скопировать Trade URL покупателя → отправить trade offer в Steam → вставить ID/ссылку offer в поле на странице сделки → сохранить.  
**Ожидание:** Poll-статус обновляется; инструкции из `seller-trade-instructions` видны; `trade-poll-status` показывает ожидание/прогресс.  
**Шаги (buyer):** Принять обмен в Steam (вручную).  
**Ожидание:** После подтверждения на бэкенде статус переходит к завершению (`TRADE_CONFIRMED` → `COMPLETED` или через mock в dev).

### TC-18. Карточка лота: похожие предложения

**Предусловие:** В каталоге ≥2 активных лота с одним типом оружия (например, AK-47).  
**Шаги:** Открыть `/lots/:id` первого лота.  
**Ожидание:** Блок `similar-lots` с карточками `similar-lot-{id}`; wear-bar (`wear-bar`, `wear-bar-value`) для предмета с float; CTA `buy-lot-button`.

### TC-19. Каталог: категории и фильтры

**Шаги:** Открыть `/catalog` с несколькими лотами разных типов оружия.  
**Ожидание:** Счётчик `catalog-total` («Найдено лотов: N»).  
**Шаги:** Вкладка «Винтовки» (`catalog-category-tab-rifles`).  
**Ожидание:** Список сужается до AK-47; total обновляется. Сброс фильтров возвращает полный список.

---

## Ожидаемые статусы

### Order

| Статус | Значение для QA |
|--------|-----------------|
| `CREATED` | Заказ создан (кратковременно) |
| `PAYMENT_RESERVED` | Средства зарезервированы |
| `WAITING_TRADE` | Ожидание обмена в Steam |
| `TRADE_CONFIRMED` | Обмен подтверждён, расчёт |
| `COMPLETED` | Сделка успешна |
| `CANCELED` | Отмена покупателем |
| `FAILED` | Не состоялась (refund) |
| `DISPUTE` | Спор, нужен admin |

### Lot

| Статус | Значение |
|--------|----------|
| `ACTIVE` | В каталоге |
| `RESERVED` | В активной покупке |
| `SOLD` | Продан |
| `CANCELED` | Снят с продажи |
| `BLOCKED` | Заблокирован admin |

---

## Полезные команды

```bash
# Backend
cd backend && npm run lint && npm run build && npm test && npm run test:e2e

# Frontend
cd frontend && npm run lint && npm run build && npm run test:unit && npm run test:e2e
```

Чеклист релиза и Gate 4 (staging): [docs/RELEASE.md](docs/RELEASE.md).

Сброс БД в e2e: `POST /api/v1/test/reset` (только при `ENABLE_TEST_ROUTES=true`).
