# QA — Quiet inventory cards 0.6.45

## Продуктовое решение

Карточка в сетке Steam — не прайс-лист. **Default:** скин виден; якорь цены + CTA. Детали — на hover / selected / bulk.

### Default (покой)

- Нет бейджа «R.I.P» на каждой клетке (бренд в host bar).
- Статус-бейджи только когда есть смысл (listed / hold / deal / blocked), max 2.
- Тонкий wear-track при известном float.
- Одна компактная цена: `~$12.50` / `$18.00` / `Bid $17` / `от $9` (без префикса R.I.P).
- CTA «Продать» / «Нельзя list» — primary gradient p2pcs.

### Hover / activeInfo / bulk selected

Раскрывается `.rip-item-detail`: float · wear · seed, Steam / R.I.P от, bid chip, «вам ~$».

### Визуал

Те же токены, что host bar / popup: `#0284c7→#2563eb`, `#7dd3fc` hover ring, `#86efac` net, `#0b0d12` footer wash.

## Проверка

1. Load **0.6.45**, hard refresh инвентаря Steam.
2. Покой: на карточке нет стены из R.I.P / Steam / вам; скин читается; цена + Продать.
3. Hover: появляются Steam / вам / meta.
4. Клик по предмету (activeInfo): detail остаётся.
5. Listed / hold: один статус-чип сверху, не бренд R.I.P.
6. CTA визуально как кнопки на сайте / host bar.
