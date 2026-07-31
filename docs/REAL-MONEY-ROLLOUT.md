# Real-money rollout — R.I.P. Market

Пошаговый план включения **реальных USDT** и **полных сделок** на staging (p2pcs.ru) и prod.  
Цель: максимальная безопасность клиентских денег при поэтапном снижении операционного риска.

---

## Принципы

1. Один слой риска за раз: deposit → trade verification → settlement → withdrawal.
2. Allowlist и жёсткие лимиты до публичного beta.
3. Kill switches проверены до каждой фазы.
4. Ежедневный reconcile ledger + payments.

---

## Фазы

| Фаза | Что включено | Что выключено | Клиенты |
|------|--------------|---------------|---------|
| **0** Pre-flight | Gateway infra, health checks | Всё для пользователей | Команда |
| **1** Deposits | USDT TRC-20 deposit, buy/hold/cancel | Real settlement, auto-withdraw | Invite-only beta |
| **2** Trade verify | Shadow → live poll / extension | Real settlement | Тестеры + allowlist |
| **3** Settlement | `ENABLE_REAL_SETTLEMENT` + allowlist | Широкий withdraw | Allowlist pairs |
| **4** Withdrawals | Signer + manual review queue | — | После 2 нед. стабильного settle |
| **5** Public beta | Расширение когорты по KPI | — | По метрикам |

---

## Фаза 0 — Pre-flight

### Steam HTTP proxy (обязательно на VPS)

Proxy живёт **только** в `backend/.env.secrets`: systemd грузит `.env` после секретов, поэтому пустой `STEAM_HTTP_PROXY=` в `.env` перекрыл бы реальное значение. Деплой и rollout-скрипты теперь сами держат этот инвариант (`ensure_steam_proxy_secret`) — вручную ключ в `.env` добавлять не нужно.

```bash
STEAM_HTTP_PROXY='http://LOGIN:PASSWORD@gw.dataimpulse.com:823' \
  bash scripts/configure-steam-proxy-staging.sh
bash scripts/verify-steam-proxy-staging.sh
```

`STEAM_HTTP_PROXY_ALL=true` в secrets — trade poll (`api.steampowered.com`) тоже через proxy.

### Секреты (один раз)

```bash
cp .env.staging.example .env.staging
# Заполнить: CRYPTO_GATEWAY_API_KEY, CRYPTO_GATEWAY_WEBHOOK_SECRET,
# GATEWAY_XPUB, GATEWAY_POSTGRES_PASSWORD, PLATFORM_WEBHOOK_URL
```

`PLATFORM_WEBHOOK_URL` для p2pcs:

```env
PLATFORM_WEBHOOK_URL=https://p2pcs.ru/api/v1/payments/webhooks/crypto
```

Те же `CRYPTO_GATEWAY_API_KEY` и `CRYPTO_GATEWAY_WEBHOOK_SECRET` — в `backend/.env`.

### Deploy gateway (deposits only, без signer)

```bash
bash scripts/deploy-crypto-gateway-staging.sh
```

### Verify

```bash
API_BASE=https://p2pcs.ru/api/v1 GATEWAY_URL=http://127.0.0.1:3001 \
  bash scripts/verify-payments-readiness.sh
```

**Gate:** gateway `/v1/health` ok; platform `/health` → `cryptoGateway: "ok"` (после фазы 1).

---

## Фаза 1 — USDT deposits (текущий шаг)

### Enable platform

```bash
export CRYPTO_GATEWAY_API_KEY=...
export CRYPTO_GATEWAY_WEBHOOK_SECRET=...
bash scripts/enable-crypto-payments-staging.sh
```

Скрипт:
- `PAYMENT_PROVIDER=crypto_tron`, `ENABLE_MOCK_DEPOSIT=false`
- Сохраняет Steam auth/inventory
- `TRADE_VERIFICATION_MODE=shadow`, `ENABLE_REAL_SETTLEMENT=false`
- `VITE_QA_MOCK_DEPOSIT=true` — тестовое пополнение для QA (не реальные деньги)

### Smoke (invite-only)

1. Войти через Steam → **Кошелёк** → вкладка **Пополнение**
2. Скопировать TRC-20 адрес → отправить **≥ $5 USDT** (mainnet)
3. Дождаться зачисления (до ~3 мин, 19 confirmations)
4. Баннер «Пополнение зачислено» + баланс **Доступно**
5. Купить лот → hold → Admin mock complete (временно)

### Gate выхода

- [ ] 10+ депозитов без инцидентов
- [ ] `npm run reconcile:payments` → 0 issues (7 дней)
- [ ] 0 support-тикетов «деньги пропали»

---

## Фаза 2 — Реальный Steam trade (без автосеттла)

### 2a. Shadow (первый шаг)

```bash
export STEAM_WEB_API_KEY=...
export CRYPTO_GATEWAY_API_KEY=...
export CRYPTO_GATEWAY_WEBHOOK_SECRET=...
# Опционально: только для internal rollout продавцов
# export EXTENSION_INTERNAL_STEAM_IDS=76561198...,76561198...

bash scripts/enable-phase2-shadow-trade-staging.sh
bash scripts/verify-trade-readiness.sh
```

Проверка: `EXPECT_MODE=shadow bash scripts/verify-trade-readiness.sh`

Чек-лист QA: [QA-SHADOW-GATE.md](./QA-SHADOW-GATE.md)

На странице сделки — баннер **«Проверка обмена (shadow)»**. Admin: `/admin/orders/:id` → shadow snapshots → Apply observed status.

### 2b. Live verification (без settlement)

После 5+ успешных shadow checks:

```bash
bash scripts/enable-phase2-live-trade-staging.sh
EXPECT_MODE=live bash scripts/verify-trade-readiness.sh
```

Сделки завершаются через Steam poll/extension. Mock trade для users отключён.

### Gate (Gate 4)

- [ ] 10+ inventory syncs
- [ ] 5+ trade checks корректны
- [ ] 7 дней ledger reconcile = 0
- [ ] Rollback: `bash scripts/rollback-to-mock-trade-staging.sh`

---

## Фаза 3 — Real settlement (allowlist)

```bash
export STEAM_SETTLEMENT_ALLOWLIST_STEAM_IDS=76561198...,76561198...
bash scripts/enable-phase3-settlement-staging.sh
```

Оба участника сделки — в allowlist. Mock Admin complete **отключён** для users.

Extension path: 8-day settlement hold включён автоматически.

---

## Фаза 4 — Withdrawals

```bash
# GATEWAY_MNEMONIC + GATEWAY_HOT_WALLET_ADDRESS в .env.staging
bash scripts/deploy-crypto-signer-staging.sh
```

---

## Kill switches

| Ситуация | Действие |
|----------|----------|
| Проблемы с выплатой продавцу | `ENABLE_REAL_SETTLEMENT=false` |
| Extension инцидент | `EXTENSION_ROLLOUT_KILL_SWITCH=true` |
| Катастрофа payments | `PAYMENT_PROVIDER=mock`, `ENABLE_MOCK_DEPOSIT=true` |

---

## Ежедневный ops (cron)

```bash
cd backend && npm run reconcile:ledger
cd backend && npm run reconcile:payments
curl -sf https://p2pcs.ru/api/v1/health
```

---

## Скрипты

| Скрипт | Назначение |
|--------|------------|
| `scripts/deploy-crypto-gateway-staging.sh` | Gateway api + scanner + DB |
| `scripts/enable-crypto-payments-staging.sh` | Phase 1 на p2pcs |
| `scripts/enable-phase2-shadow-trade-staging.sh` | Phase 2a — shadow + extension |
| `scripts/enable-phase2-live-trade-staging.sh` | Phase 2b — live verify, no settle |
| `scripts/enable-phase3-settlement-staging.sh` | Phase 3 — allowlisted settlement |
| `scripts/deploy-crypto-signer-staging.sh` | Phase 4 — on-chain withdrawals |
| `scripts/rollback-to-mock-trade-staging.sh` | Emergency rollback (Gate 4 drill) |
| `scripts/verify-payments-readiness.sh` | Preflight payments |
| `scripts/configure-steam-proxy-staging.sh` | DataImpulse / residential proxy |
| `scripts/verify-steam-proxy-staging.sh` | Proxy + steamcommunity smoke |
| `scripts/setup-reconcile-cron.sh` | Daily reconcile cron |
| `scripts/enable-steam-staging.sh` | Steam auth (legacy) |

---

## Связанные документы

- [payments-crypto-tron.md](./payments-crypto-tron.md)
- [RELEASE.md](./RELEASE.md) — Gate 4
- [phase-4-settlement.md](./phase-4-settlement.md)
- [phase-5-extension-first.md](./phase-5-extension-first.md)
- [QA-SHADOW-GATE.md](./QA-SHADOW-GATE.md)
