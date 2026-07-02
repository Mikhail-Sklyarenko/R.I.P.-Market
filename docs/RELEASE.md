# Release v1 — R.I.P. Market

Чеклист первого релиза CS2 P2P MVP. Разделён на то, что **закрыто в репозитории**, и то, что **выполняет оператор на staging** (Gate 4).

---

## A. Готовность кода (репозиторий)

| Критерий | Статус |
|----------|--------|
| Фазы 0–4.5 (sell, buy, wallet, dispute, Steam providers) | Закрыты в коде |
| Buyer/seller UI на русском (каталог, лот, checkout, сделка, кошелёк, аккаунт) | ✓ |
| Admin/ops UI | EN (внутренние инструменты) |
| Mock dev-панели скрыты на staging (`VITE_STAGING`) | ✓ |
| CI: backend lint/build/unit/e2e | ✓ |
| CI: frontend lint/build/unit/e2e | ✓ |
| Playwright: 20+ сценариев (buy/sell, wallet, dispute, catalog, lot, account) | ✓ |
| `TESTING.md` — ручные TC-01…TC-19 | ✓ |
| Rollback на mock — [phase-4-steam.md](./phase-4-steam.md) | Документирован |

### Команды перед тегом релиза

```bash
# Backend (нужен Postgres)
cd backend && npm run db:up
npm run prisma:migrate:deploy
npm run lint && npm run build && npm test -- --ci && npm run test:e2e

# Frontend
cd frontend && npm run lint && npm run build && npm run test:unit && npm run test:e2e
```

---

## B. Staging deploy (оператор)

### Backend `.env` (старт — mock, затем Steam)

См. `backend/.env.staging.example`. Минимум для закрытого staging:

```env
JWT_SECRET=<сильный-секрет>
FRONTEND_ORIGIN=https://staging.example.com
AUTH_PROVIDER=mock
INVENTORY_PROVIDER=mock
TRADE_PROVIDER=mock
ENABLE_MOCK_TRADE=true
ENABLE_MOCK_DEPOSIT=false
PAYMENT_PROVIDER=crypto_tron
CRYPTO_GATEWAY_URL=http://crypto-gateway-api:3001
CRYPTO_GATEWAY_API_KEY=<shared-with-gateway>
CRYPTO_GATEWAY_WEBHOOK_SECRET=<shared-with-gateway>
ENABLE_TEST_ROUTES=false
```

Crypto gateway stack: [payments-crypto-tron.md](./payments-crypto-tron.md).

Переход на реальный Steam (поэтапно, см. [phase-4-steam.md](./phase-4-steam.md)):

```env
AUTH_PROVIDER=steam
INVENTORY_PROVIDER=steam
TRADE_PROVIDER=steam
STEAM_OPENID_REALM=https://api-staging.example.com
STEAM_WEB_API_KEY=<key>
TRADE_VERIFICATION_MODE=shadow
ENABLE_REAL_SETTLEMENT=false
```

### Frontend `.env`

См. `frontend/.env.staging.example`:

```env
VITE_API_BASE_URL=https://api-staging.example.com/api/v1
VITE_ENABLE_MOCK_TRADE=false
VITE_STAGING=true
VITE_SUPPORT_EMAIL=support@your-domain.com
```

---

## C. Gate 4 — оператор (вы проводите сами)

Отметьте после staging с `INVENTORY_PROVIDER=steam` и `TRADE_PROVIDER=steam`:

| # | Критерий | Как фиксировать | Готово |
|---|----------|-----------------|--------|
| 1 | **10+** реальных чтений инвентаря без инцидентов | Лог `inventory_sync`, 7 дней staging | ☐ |
| 2 | **5+** реальных trade checks (poll) корректны | Журнал ручных сделок + shadow snapshots | ☐ |
| 3 | **7 дней** без расхождений ledger | `npm run reconcile:ledger` daily cron + 0 issues | ☐ |
| 4 | **Rollback на mock** проверен | Env → mock, E2E green, smoke buy | ☐ |

Шаблон журнала:

```
| Дата | Операция | Steam ID | Order ID | Результат | Примечание |
|------|----------|----------|----------|-----------|------------|
|      | inventory_sync | | | OK/FAIL | |
|      | trade_poll | | | accepted/declined/timeout | |
```

### Рекомендуемая последовательность на staging

1. Deploy mock → smoke `TESTING.md` TC-05, TC-09
2. `AUTH_PROVIDER=steam` → привязка Steam (TC-16)
3. `INVENTORY_PROVIDER=steam` → синхронизация инвентаря (seller)
4. `TRADE_PROVIDER=steam` + `TRADE_VERIFICATION_MODE=shadow` → ручные сделки (TC-17)
5. 7d мониторинг ledger + inventory metrics
6. При необходимости `live` + allowlist ([phase-4-settlement.md](./phase-4-settlement.md))
7. Rollback drill по [phase-4-steam.md](./phase-4-steam.md)

---

## D. Известные ограничения v1

- Нет автобота trade offer — ручной P2P + poll на бэкенде
- Пополнение/вывод — USDT TRC-20 через crypto-gateway (mock deposit отключён на staging)
- Seller sidebar профиля — не в scope
- Admin UI на английском

---

## E. После релиза

- [ ] Тег `v1.0.0` + release notes
- [ ] `ENABLE_TEST_ROUTES=false` на всех non-CI окружениях
- [ ] Мониторинг: `GET /health`, `GET /health/metrics`, алерты на `RECONCILIATION_FAILED`
- [ ] Support email в `VITE_SUPPORT_EMAIL`
