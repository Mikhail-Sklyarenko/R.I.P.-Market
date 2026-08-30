# QA — Deal Shield 1a–1e (extension 0.6.38)

Продуктовый щит активной сделки: кто контрагент, какой заказ/скин, сверка с Steam.

## Что проверять

### 1a — Identity
- На странице `tradeoffer/{id}`: аватар, роль (Продавец/Покупатель), SteamID + копировать + ссылка на профиль.
- В popover списка tradeoffers — то же.

### 1b — Partner verify
- Подставить чужой Steam-партнёр (или неверный URL) → mismatch, Accept assist скрыт, спор доступен.
- Верный партнёр + верный asset → verified (при прочих ok).

### 1c — Характеристики
- Wear / float / stickers показываются только если есть в заказе; пустые строки не рисуются.

### 1d — Единый язык
- Popup карточки покупок/продаж: strip с аватаром и характеристиками.
- Страница заказа: `TradeCounterpartyCard` с аватаром + item lines (buyer и seller).

### 1e — Pre-send (продавец)
- На `/tradeoffer/new/?partner=…` при активной продаже: баннер «Перед отправкой», покупатель + предмет + сверка partner из URL.

## Не регрессировать
- Unlinked offer → «Не наша сделка».
- Anti-scam (лишние предметы) блокирует Accept.
- «Никогда не Accept за вас».
- Guided buyer flag off: shield/mismatch остаются, Accept assist нет.
