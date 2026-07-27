# QA — Shadow Gate (Phase 2a)

Короткий чек-лист для **закрытого beta** на [p2pcs.ru](https://p2pcs.ru) перед переходом к Phase 2b (live trade).

**Цель gate:** 5–10 реальных сделок с корректными shadow snapshots, **0** неожиданных смен статуса/ledger, proxy Steam стабилен.

**Время:** ~2–3 часа (2 Steam-аккаунта + Admin).

---

## Предусловия (ops)

- [ ] `GET /api/v1/health` → `cryptoGateway: "ok"`, `steamHttpProxy: "configured"`
- [ ] `GET /api/v1/auth/config` → `steamHttpProxyConfigured: true`, `tradeVerificationMode: "shadow"`
- [ ] `tradeProvider: "steam"`, `enableRealSettlement: false`
- [ ] `bash scripts/verify-steam-proxy-staging.sh` — OK
- [ ] `EXPECT_MODE=shadow bash scripts/verify-trade-readiness.sh` — OK

---

## Подготовка аккаунтов

| # | Шаг | Ожидание |
|---|-----|----------|
| P1 | Steam A и B: публичный инвентарь CS2 | Инвентарь грузится |
| P2 | Оба: `/account` → Trade URL сохранён | Чеклист ✓ |
| P3 | Продавец A: расширение подключено (опционально) | `ExtensionConnectPanel` — paired |
| P4 | Покупатель B: USDT на балансе (≥ цены лота) | Кошелёк → пополнение TRC-20 |

---

## Сценарий S1 — Happy path (extension или ручной offer)

| # | Шаг | Ожидание |
|---|-----|----------|
| S1.1 | B покупает лот A | `WAITING_TRADE`, hold на кошельке B |
| S1.2 | На странице сделки | Баннер **«Проверка обмена (shadow)»** |
| S1.3 | A отправляет trade (расширение или offer ID вручную) | Фазы extension / poll status обновляется |
| S1.4 | B принимает обмен в Steam | — |
| S1.5 | Admin → `/admin/orders/:id` | Shadow snapshot `STEAM_POLL` с `accepted` (или ожидаемый статус) |
| S1.6 | Admin → **Apply observed status** (если нужно в shadow) | Статус согласован с Steam, **без** автосеттла продавцу |

**Pass:** snapshot совпадает с фактом в Steam; ledger без сюрпризов (hold не списан продавцу автоматически).

---

## Сценарий S2 — Отмена покупателем

| # | Шаг | Ожидание |
|---|-----|----------|
| S2.1 | B покупает → `WAITING_TRADE` | Hold |
| S2.2 | B → **Отменить сделку** | `CANCELED`, hold → available |
| S2.3 | Каталог | Лот снова `ACTIVE` |

---

## Сценарий S3 — Негатив (минимум один)

| Кейс | Ожидание |
|------|----------|
| Покупка без Trade URL у buyer/seller | Понятная ошибка / блок до сделки |
| Неверный offer ID (ручной путь) | Poll не ломает заказ; admin видит mismatch |
| Steam 403 на инвентаре | Нет после настройки proxy; если есть — стоп gate |

---

## Gate-критерии (переход на Phase 2b)

| # | Критерий | Готово |
|---|----------|--------|
| G1 | **5+** сделок с корректным shadow snapshot | ☐ |
| G2 | **0** auto-transition в `COMPLETED` без admin/live | ☐ |
| G3 | **0** mismatches без объяснения (или все разобраны) | ☐ |
| G4 | **7 дней** `reconcile:ledger` = 0 issues (или с даты Phase 1) | ☐ |
| G5 | Proxy smoke + inventory sync стабильны | ☐ |

После gate:

```bash
bash /opt/rip-market/scripts/enable-phase2-live-trade-staging.sh
EXPECT_MODE=live bash /opt/rip-market/scripts/verify-trade-readiness.sh
```

---

## Шаблон журнала сделки

```
| Дата | Order ID | Seller Steam | Buyer Steam | Offer | Snapshot | Match | Примечание |
|------|----------|--------------|-------------|-------|----------|-------|------------|
|      |          |              |             |       | accepted | OK    |            |
```

---

## Баг-репорт (минимум)

1. Сценарий + шаг  
2. Order ID  
3. Ожидание / факт  
4. Скрин admin shadow table + страница сделки  
5. `GET /auth/config` (steamHttpProxyConfigured, tradeVerificationMode)

---

## Связанные документы

- [REAL-MONEY-ROLLOUT.md](./REAL-MONEY-ROLLOUT.md)
- [QA-STAGING-p2pcs.md](./QA-STAGING-p2pcs.md)
- [phase-4-shadow.md](./phase-4-shadow.md)
