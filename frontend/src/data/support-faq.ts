export type SupportFaqArticle = {
  id: string;
  title: string;
  keywords: string[];
  body: string;
};

export const SUPPORT_FAQ_ARTICLES: readonly SupportFaqArticle[] = [
  {
    id: 'buying',
    title: 'Как купить скин',
    keywords: ['покупка', 'купить', 'каталог', 'checkout', 'оплата'],
    body:
      'Выберите лот в каталоге, откройте страницу предмета и нажмите «Купить». Средства резервируются на кошельке, после чего продавец отправит обмен в Steam. Примите trade offer — только после этого сделка считается успешной.',
  },
  {
    id: 'selling',
    title: 'Как продать скин',
    keywords: ['продажа', 'продать', 'лот', 'инвентарь', 'выставить'],
    body:
      'Привяжите Steam, синхронизируйте инвентарь в разделе «Продать» и выставьте предмет с ценой. После покупки отправьте обмен покупателю через Steam или расширение R.I.P. Market.',
  },
  {
    id: 'extension',
    title: 'Расширение для браузера',
    keywords: ['расширение', 'extension', 'chrome', 'обмен', 'автоматизация'],
    body:
      'Расширение помогает продавцу пройти этапы обмена в Steam: открыть страницу trade offer и добавить предмет. Установите его из инструкции на странице сделки и подключите к аккаунту.',
  },
  {
    id: 'settlement-hold',
    title: 'Удержание средств 8 дней',
    keywords: ['hold', 'удержание', '8 дней', 'settlement', 'выплата'],
    body:
      'После подтверждённого обмена средства продавца могут находиться на удержании до 8 дней — это защита от отмены сделки в Steam. По окончании периода выплата зачисляется на кошелёк автоматически.',
  },
  {
    id: 'trade-hold',
    title: 'Trade hold в Steam',
    keywords: ['trade hold', 'steam', 'блокировка', 'обмен', '7 дней'],
    body:
      'Steam может временно блокировать обмены на новом устройстве или аккаунте. Убедитесь, что предмет tradable и trade URL указан в личном кабинете. Мы не можем снять ограничения Steam со своей стороны.',
  },
  {
    id: 'dispute',
    title: 'Спор по сделке',
    keywords: ['спор', 'dispute', 'проблема', 'не пришёл', 'возврат'],
    body:
      'Если обмен не состоялся или возникла ошибка — откройте сделку в «Мои сделки». При таймауте или эскалации статус может перейти в спор, и команда поддержки рассмотрит ситуацию. Укажите ID сделки в письме.',
  },
  {
    id: 'wallet',
    title: 'Пополнение и вывод',
    keywords: ['кошелёк', 'usdt', 'пополнить', 'вывести', 'баланс'],
    body:
      'Пополнение и вывод доступны в разделе «Кошелёк». Для покупки нужен достаточный доступный баланс; при нехватке средств checkout предложит пополнить счёт.',
  },
  {
    id: 'trade-url',
    title: 'Trade URL — обязательное поле',
    keywords: ['trade url', 'ссылка', 'обмен', 'steam'],
    body:
      'Без Trade URL нельзя выставить предмет и оформить покупку. Откройте настройки Steam → «Кто может присылать мне предложения обмена?», скопируйте ссылку и сохраните в разделе «Аккаунт».',
  },
  {
    id: 'extension-errors',
    title: 'Ошибки расширения и обмена',
    keywords: ['extension', 'item_missing', 'trade hold', 'session_revoked', 'ошибка'],
    body:
      'ITEM_MISSING — синхронизируйте инвентарь. TRADE_HOLD_BLOCKED — ограничение Steam, отправьте offer вручную. SESSION_REVOKED — переподключите расширение в аккаунте. STEAM_ACCOUNT_MISMATCH — войдите в Steam под аккаунтом продавца в том же Chrome.',
  },
  {
    id: 'vac-ban',
    title: 'VAC-бан',
    keywords: ['vac', 'бан', 'заблокирован'],
    body:
      'Аккаунты с VAC-баном не могут продавать и покупать на площадке. Это ограничение безопасности для P2P-сделок CS2.',
  },
];

export function filterSupportFaq(query: string): SupportFaqArticle[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return [...SUPPORT_FAQ_ARTICLES];
  }

  return SUPPORT_FAQ_ARTICLES.filter((article) => {
    const haystack = [article.title, article.body, ...article.keywords]
      .join(' ')
      .toLowerCase();
    return haystack.includes(normalized);
  });
}
