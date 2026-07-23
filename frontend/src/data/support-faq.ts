import type { Locale } from '../i18n/types.ts';
import { SUPPORT_FAQ_CATEGORIES_EN } from './support-faq-en.ts';

export type SupportFaqCategoryId =
  | 'general'
  | 'security'
  | 'deposit'
  | 'buying'
  | 'selling'
  | 'withdrawal'
  | 'extras';

export type SupportFaqArticle = {
  id: string;
  category: SupportFaqCategoryId;
  title: string;
  keywords: string[];
  body: string;
};

export type SupportFaqCategory = {
  id: SupportFaqCategoryId;
  title: string;
  articles: readonly SupportFaqArticle[];
};

export const SUPPORT_FAQ_CATEGORIES: readonly SupportFaqCategory[] = [
  {
    id: 'general',
    title: 'Общие вопросы',
    articles: [
      {
        id: 'what-is-rip',
        category: 'general',
        title: 'Что такое R.I.P. Market?',
        keywords: ['маркетплейс', 'p2p', 'cs2', 'скины'],
        body:
          'R.I.P. Market — P2P-площадка для сделок со скинами CS2. Покупатель резервирует средства на кошельке, продавец отправляет обмен в Steam, после подтверждения передачи предмета сделка завершается.\n\n' +
          'Мы не храним предметы на своих ботах: обмен идёт напрямую между аккаунтами Steam. Комиссия площадки удерживается при успешной сделке.',
      },
      {
        id: 'supported-games',
        category: 'general',
        title: 'Какие игры поддерживаются?',
        keywords: ['cs2', 'игры', 'dota', 'rust'],
        body:
          'Сейчас поддерживается CS2 (Counter-Strike 2). Инвентарь синхронизируется из Steam, сделки проходят через стандартные trade offer.',
      },
      {
        id: 'extension',
        category: 'general',
        title: 'Расширение для браузера',
        keywords: ['расширение', 'extension', 'chrome', 'обмен', 'автоматизация'],
        body:
          'Расширение R.I.P. Market помогает продавцу автоматизировать отправку trade offer: открывает страницу обмена в Steam, добавляет предмет и сообщает о статусе на сайте.\n\n' +
          'Установите расширение по инструкции на странице сделки, подключите его в разделе «Аккаунт» и войдите в Steam под аккаунтом продавца в том же браузере Chrome.',
      },
      {
        id: 'trade-url',
        category: 'general',
        title: 'Trade URL — обязательное поле',
        keywords: ['trade url', 'ссылка', 'обмен', 'steam'],
        body:
          'Trade URL нужен для всех P2P-обменов. Без него нельзя купить скин или выставить предмет на продажу.\n\n' +
          'В разделе «Аккаунт» нажмите «Получить ссылку» — откроются настройки Steam. Скопируйте ссылку из блока «Кто может присылать мне предложения обмена?» и вставьте в профиль R.I.P. Market.',
      },
    ],
  },
  {
    id: 'security',
    title: 'О безопасности на сайте',
    articles: [
      {
        id: 'trade-hold',
        category: 'security',
        title: 'Trade hold в Steam',
        keywords: ['trade hold', 'steam', 'блокировка', 'обмен', '7 дней'],
        body:
          'Steam может временно ограничивать обмены на новом устройстве, после смены пароля или на «свежем» аккаунте. Это ограничение Steam — мы не можем его снять.\n\n' +
          'Убедитесь, что предмет tradable, Trade URL указан, а в браузере открыт правильный Steam-аккаунт. При trade hold отправьте offer вручную или дождитесь снятия ограничения.',
      },
      {
        id: 'vac-ban',
        category: 'security',
        title: 'VAC-бан',
        keywords: ['vac', 'бан', 'заблокирован'],
        body:
          'Аккаунты с VAC-баном в CS2 не могут продавать и покупать на площадке. Это защитное ограничение для P2P-сделок.\n\n' +
          'Если бан снят в Steam, но доступ не восстановился — обратитесь в поддержку с вашим Steam ID.',
      },
      {
        id: 'settlement-hold',
        category: 'security',
        title: 'Удержание средств до 8 дней',
        keywords: ['hold', 'удержание', '8 дней', 'settlement', 'выплата'],
        body:
          'После подтверждённого обмена выплата продавца может находиться на удержании до 8 дней. Это защита от отмены сделки в Steam (trade reversal).\n\n' +
          'По окончании периода средства автоматически переходят в доступный баланс. Статус удержания виден в кошельке и на странице сделки.',
      },
      {
        id: 'scam-protection',
        category: 'security',
        title: 'Как не попасть на мошенничество',
        keywords: ['безопасность', 'скам', 'мошенник', 'проверка'],
        body:
          'Проверяйте предмет в trade offer перед принятием: название, wear, float. Не принимайте обмены с лишними предметами от продавца.\n\n' +
          'R.I.P. Market никогда не просит пароль Steam или код Steam Guard. Обмены проходят только через официальный клиент Steam.',
      },
    ],
  },
  {
    id: 'deposit',
    title: 'Пополнение баланса',
    articles: [
      {
        id: 'wallet-deposit',
        category: 'deposit',
        title: 'Как пополнить кошелёк USDT',
        keywords: ['кошелёк', 'usdt', 'пополнить', 'баланс', 'trc-20'],
        body:
          'Откройте «Кошелёк» → вкладка «Пополнение». Скопируйте TRC-20 адрес или отсканируйте QR-код. Переведите USDT только в сети TRON (TRC-20).\n\n' +
          'Минимальная сумма и предупреждения указаны на странице. Зачисление появится после подтверждений в сети — обычно 5–15 минут. Курс: 1 USDT = 1 USD на балансе маркетплейса.',
      },
      {
        id: 'wallet-hold',
        category: 'deposit',
        title: 'Что такое hold при покупке',
        keywords: ['hold', 'резерв', 'баланс', 'покупка'],
        body:
          'При покупке сумма сделки переводится из «Доступно» в «В hold». Деньги зарезервированы для продавца, но ещё не переданы — это защита покупателя.\n\n' +
          'После успешного обмена hold списывается в пользу продавца. При отмене, таймауте или неудачной сделке средства возвращаются в доступный баланс.',
      },
      {
        id: 'wrong-network',
        category: 'deposit',
        title: 'Отправил USDT не в той сети',
        keywords: ['сеть', 'erc-20', 'bep-20', 'ошибка', 'депозит'],
        body:
          'Площадка принимает только USDT TRC-20. Переводы в ERC-20, BEP-20 и других сетях не зачисляются автоматически и могут быть потеряны.\n\n' +
          'Если ошибка уже произошла — сразу создайте тикет с хешем транзакции и адресом отправителя.',
      },
    ],
  },
  {
    id: 'buying',
    title: 'Покупка вещей',
    articles: [
      {
        id: 'buying',
        category: 'buying',
        title: 'Как купить скин',
        keywords: ['покупка', 'купить', 'каталог', 'checkout', 'оплата'],
        body:
          '1. Выберите скин в каталоге и откройте лот.\n' +
          '2. Нажмите «Купить» — средства резервируются на кошельке.\n' +
          '3. Дождитесь trade offer от продавца.\n' +
          '4. Примите обмен в Steam, проверив предмет.\n' +
          '5. Статус сделки обновится автоматически после подтверждения передачи.',
      },
      {
        id: 'buyer-checklist',
        category: 'buying',
        title: 'Что проверить перед принятием обмена',
        keywords: ['проверка', 'покупатель', 'wear', 'float'],
        body:
          'Сверьте market hash name, состояние (wear) и float с описанием лота. Убедитесь, что продавец отправляет только ожидаемый предмет.\n\n' +
          'При установленном расширении R.I.P. Market на странице trade offer в Steam отображается панель проверки сделки.',
      },
      {
        id: 'dispute',
        category: 'buying',
        title: 'Спор по сделке',
        keywords: ['спор', 'dispute', 'проблема', 'не пришёл', 'возврат'],
        body:
          'Если обмен не состоялся, предмет не совпадает или возникла ошибка — откройте сделку в «Мои сделки». При таймауте статус может перейти в спор.\n\n' +
          'Создайте тикет в поддержке с ID сделки, скриншотами trade offer и кратким описанием проблемы.',
      },
    ],
  },
  {
    id: 'selling',
    title: 'Продажа вещей',
    articles: [
      {
        id: 'selling',
        category: 'selling',
        title: 'Как продать скин',
        keywords: ['продажа', 'продать', 'лот', 'инвентарь', 'выставить'],
        body:
          '1. Привяжите Steam и укажите Trade URL.\n' +
          '2. Откройте «Продать» → синхронизируйте инвентарь.\n' +
          '3. Выберите предмет и укажите цену.\n' +
          '4. После покупки отправьте trade offer покупателю (вручную или через расширение).\n' +
          '5. Получите выплату на кошелёк за вычетом комиссии 5%.',
      },
      {
        id: 'extension-errors',
        category: 'selling',
        title: 'Ошибки расширения и обмена',
        keywords: ['extension', 'item_missing', 'trade hold', 'session_revoked', 'ошибка'],
        body:
          'ITEM_MISSING — синхронизируйте инвентарь на сайте, убедитесь что предмет не продан в Steam.\n\n' +
          'TRADE_HOLD_BLOCKED — ограничение Steam, отправьте offer вручную.\n\n' +
          'SESSION_REVOKED — переподключите расширение в аккаунте.\n\n' +
          'STEAM_ACCOUNT_MISMATCH — войдите в Steam под аккаунтом продавца в том же Chrome.',
      },
      {
        id: 'pricing',
        category: 'selling',
        title: 'Как назначить цену',
        keywords: ['цена', 'комиссия', 'steam', 'маркет'],
        body:
          'В каталоге отображаются цены Steam и маркетплейса — ориентируйтесь на них при выставлении лота. Комиссия площадки — 5%, итоговая выплата показывается при создании лота.\n\n' +
          'Цена указывается в USD/USDT. Цену активного лота можно изменить или снять с продажи из инвентаря или раздела «Мои лоты».',
      },
    ],
  },
  {
    id: 'withdrawal',
    title: 'Вывод денег',
    articles: [
      {
        id: 'wallet-withdraw',
        category: 'withdrawal',
        title: 'Как вывести USDT',
        keywords: ['вывод', 'usdt', 'trc-20', 'кошелёк'],
        body:
          'Откройте «Кошелёк» → вкладка «Вывод». Укажите TRC-20 адрес и сумму. Средства спишутся с доступного баланса.\n\n' +
          'Учитывайте комиссию и минимальную сумму в форме. Статус заявки — в истории выводов на той же вкладке.',
      },
      {
        id: 'withdraw-timing',
        category: 'withdrawal',
        title: 'Сроки вывода средств',
        keywords: ['время', 'ожидание', 'обработка', 'вывод'],
        body:
          'Заявки проходят автоматическую и ручную проверку. Обычно обработка занимает от нескольких минут до нескольких часов.\n\n' +
          'Средства на hold, в активных сделках или на settlement-удержании недоступны для вывода до завершения соответствующих операций.',
      },
      {
        id: 'wallet',
        category: 'withdrawal',
        title: 'Баланс и комиссии',
        keywords: ['кошелёк', 'комиссия', 'баланс', 'выплата'],
        body:
          'Доступно — можно тратить или выводить. В hold — зарезервировано в сделках. Заморожено — временно недоступно по решению площадки.\n\n' +
          'Комиссия вывода указана в форме перед подтверждением. Итоговая сумма «к получению» рассчитывается автоматически.',
      },
    ],
  },
  {
    id: 'extras',
    title: 'Дополнительные функции',
    articles: [
      {
        id: 'notifications',
        category: 'extras',
        title: 'Уведомления',
        keywords: ['уведомления', 'сделки', 'кошелёк'],
        body:
          'В правом нижнем углу отображаются события по сделкам и кошельку. Нажмите на уведомление, чтобы перейти к заказу или балансу.\n\n' +
          'Полный список — в разделе «Уведомления» в меню пользователя.',
      },
      {
        id: 'support-ticket',
        category: 'extras',
        title: 'Обращение в поддержку',
        keywords: ['поддержка', 'тикет', 'помощь'],
        body:
          'Если ответа нет в FAQ — создайте тикет в разделе «Поддержка». Укажите ID сделки, опишите проблему и приложите скриншоты.\n\n' +
          'Для срочных вопросов можно написать на email поддержки — ссылка указана на странице тикетов.',
      },
    ],
  },
];

export function getSupportFaqCategories(
  locale: Locale = 'ru',
): readonly SupportFaqCategory[] {
  return locale === 'en' ? SUPPORT_FAQ_CATEGORIES_EN : SUPPORT_FAQ_CATEGORIES;
}

export const SUPPORT_FAQ_ARTICLES: readonly SupportFaqArticle[] =
  SUPPORT_FAQ_CATEGORIES.flatMap((category) => category.articles);

export function getSupportFaqArticles(
  locale: Locale = 'ru',
): readonly SupportFaqArticle[] {
  return getSupportFaqCategories(locale).flatMap((category) => category.articles);
}

export function getDefaultFaqSelection(): {
  categoryId: SupportFaqCategoryId;
  articleId: string;
} {
  const firstCategory = SUPPORT_FAQ_CATEGORIES[0];
  const firstArticle = firstCategory?.articles[0];
  return {
    categoryId: firstCategory?.id ?? 'general',
    articleId: firstArticle?.id ?? 'what-is-rip',
  };
}

export function findFaqArticle(
  categoryId: SupportFaqCategoryId,
  articleId: string,
  locale: Locale = 'ru',
): SupportFaqArticle | null {
  const category = getSupportFaqCategories(locale).find(
    (item) => item.id === categoryId,
  );
  return category?.articles.find((article) => article.id === articleId) ?? null;
}

export function filterSupportFaq(
  query: string,
  locale: Locale = 'ru',
): SupportFaqArticle[] {
  const normalized = query.trim().toLowerCase();
  const articles = getSupportFaqArticles(locale);
  if (!normalized) {
    return [...articles];
  }

  return articles.filter((article) => {
    const haystack = [article.title, article.body, ...article.keywords]
      .join(' ')
      .toLowerCase();
    return haystack.includes(normalized);
  });
}

export function filterSupportFaqByCategory(
  query: string,
  locale: Locale = 'ru',
): readonly SupportFaqCategory[] {
  const normalized = query.trim().toLowerCase();
  const categories = getSupportFaqCategories(locale);
  if (!normalized) {
    return categories;
  }

  return categories
    .map((category) => ({
      ...category,
      articles: category.articles.filter((article) => {
        const haystack = [article.title, article.body, ...article.keywords]
          .join(' ')
          .toLowerCase();
        return haystack.includes(normalized);
      }),
    }))
    .filter((category) => category.articles.length > 0);
}
