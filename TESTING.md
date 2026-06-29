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

Запуск: `cd frontend && npm run test:e2e`

---

## Ручные тест-кейсы

### TC-01. Гостевой каталог

**Шаги:** Открыть `/catalog` без логина.  
**Ожидание:** Сетка лотов видна; клик «View listing» открывает `/lots/:id`; кнопка «Перейти к покупке» ведёт на логин или checkout (если уже авторизован).

### TC-02. Навигация buyer

**Шаги:** Войти как Buyer. Проверить шапку: Каталог, Мои сделки, Кошелёк.  
**Ожидание:** Пункта «Продать» нет. Переходы работают.

### TC-03. Навигация seller

**Шаги:** Войти как Seller.  
**Ожидание:** В шапке есть «Продать» → `/sell/inventory`. Также доступны Мои сделки и Кошелёк.

### TC-04. Выставление лота

**Шаги:** Seller → Инвентарь → List item → цена $1000 → Submit.  
**Ожидание:** Редирект на `/sell/my-lots`; строка со статусом `ACTIVE`; превью комиссии 5% / выплата 95%.

### TC-05. Покупка через checkout

**Шаги:** Buyer → каталог → лот → «Перейти к покупке» → `/lots/:id/checkout`.  
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
**Ожидание:** Строка `WAITING_TRADE`, роль Seller, подсказка о передаче в Steam. Mock-trade панели **нет**.

### TC-10. Уведомления

**Шаги:** Завершить сделку (mock success). Открыть колокольчик / `/notifications`.  
**Ожидание:** Событие `ORDER_COMPLETED` (или локализованный заголовок). Фильтр «Сделки» работает.

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
cd frontend && npm run lint && npm run build && npm run test:e2e
```

Сброс БД в e2e: `POST /api/v1/test/reset` (только при `ENABLE_TEST_ROUTES=true`).
