export type SupportWidgetArticle = {
  id: string;
  title: string;
  keywords: string[];
  /** Короткий ответ для быстрой помощи в виджете */
  body: string;
};

export const SUPPORT_WIDGET_ARTICLES: readonly SupportWidgetArticle[] = [
  {
    id: 'widget-withdraw-time',
    title: 'Сколько времени занимает вывод средств?',
    keywords: ['вывод', 'usdt', 'время', 'ожидание'],
    body:
      'Заявка обрабатывается после проверки. Обычно это от нескольких минут до нескольких часов. Статус смотрите во вкладке «Вывод» в кошельке.',
  },
  {
    id: 'widget-deposit-missing',
    title: 'Пополнил, но баланс не пришёл',
    keywords: ['пополнение', 'депозит', 'usdt', 'баланс'],
    body:
      'Проверьте сеть TRC-20 и минимальную сумму. Зачисление появится после подтверждений в TRON — иногда это занимает 5–15 минут.',
  },
  {
    id: 'widget-trade-stuck',
    title: 'Обмен отправлен, статус не меняется',
    keywords: ['обмен', 'трейд', 'статус', 'сделка'],
    body:
      'Примите trade offer в Steam и подождите 1–2 минуты. Если статус не обновился — откройте сделку на сайте и проверьте, привязан ли offer ID.',
  },
  {
    id: 'widget-trade-url',
    title: 'Где указать Trade URL?',
    keywords: ['trade url', 'ссылка', 'обмен'],
    body:
      'Аккаунт → поле «Ссылка на обмен». Нажмите «Получить ссылку», скопируйте URL из Steam и сохраните.',
  },
  {
    id: 'widget-extension-error',
    title: 'Расширение не отправляет обмен',
    keywords: ['расширение', 'extension', 'ошибка', 'steam'],
    body:
      'Войдите в Steam под аккаунтом продавца в том же Chrome, переподключите расширение в аккаунте и обновите страницу сделки.',
  },
  {
    id: 'widget-cancel-trade',
    title: 'Можно ли отменить сделку?',
    keywords: ['отмена', 'cancel', 'спор'],
    body:
      'Покупатель может отменить до отправки обмена. После отправки offer — только через спор или поддержку, укажите ID сделки.',
  },
];

export function filterSupportWidgetFaq(query: string): SupportWidgetArticle[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return [...SUPPORT_WIDGET_ARTICLES];
  }

  return SUPPORT_WIDGET_ARTICLES.filter((article) => {
    const haystack = [article.title, article.body, ...article.keywords]
      .join(' ')
      .toLowerCase();
    return haystack.includes(normalized);
  });
}
