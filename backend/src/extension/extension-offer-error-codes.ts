export const ExtensionOfferErrorCode = {
  BUYER_TRADE_URL_INVALID: 'BUYER_TRADE_URL_INVALID',
  BUYER_TRADE_URL_MISSING: 'BUYER_TRADE_URL_MISSING',
  ITEM_MISSING: 'ITEM_MISSING',
  ITEM_MISMATCH: 'ITEM_MISMATCH',
  INVENTORY_NOT_LOADED: 'INVENTORY_NOT_LOADED',
  STEAM_UNAVAILABLE: 'STEAM_UNAVAILABLE',
  STEAM_GUARD_REQUIRED: 'STEAM_GUARD_REQUIRED',
  CONFIRM_PENDING: 'CONFIRM_PENDING',
  OFFER_SEND_FAILED: 'OFFER_SEND_FAILED',
  OFFER_DRAFT_FAILED: 'OFFER_DRAFT_FAILED',
  STEAM_ACCOUNT_MISMATCH: 'STEAM_ACCOUNT_MISMATCH',
  TRADE_HOLD_BLOCKED: 'TRADE_HOLD_BLOCKED',
} as const;

export type ExtensionOfferErrorCodeType =
  (typeof ExtensionOfferErrorCode)[keyof typeof ExtensionOfferErrorCode];

export const OFFER_ERROR_UX_HINTS: Record<
  ExtensionOfferErrorCodeType,
  { title: string; sellerHint: string; retryable: boolean }
> = {
  BUYER_TRADE_URL_INVALID: {
    title: 'Некорректная trade-ссылка покупателя',
    sellerHint:
      'Попросите покупателя обновить Trade URL в настройках аккаунта и повторите попытку.',
    retryable: true,
  },
  BUYER_TRADE_URL_MISSING: {
    title: 'У покупателя нет Trade URL',
    sellerHint:
      'Покупатель должен добавить Trade URL в профиле. Без этого обмен невозможен.',
    retryable: true,
  },
  ITEM_MISSING: {
    title: 'Предмет не найден в инвентаре',
    sellerHint:
      'Проверьте, что предмет всё ещё в вашем Steam-инвентаре и не продан вне площадки.',
    retryable: true,
  },
  ITEM_MISMATCH: {
    title: 'Предмет не совпадает с заказом',
    sellerHint:
      'Убедитесь, что отправляете именно тот скин, который указан в лоте (asset id / название).',
    retryable: false,
  },
  INVENTORY_NOT_LOADED: {
    title: 'Инвентарь Steam не загружен',
    sellerHint:
      'Откройте страницу инвентаря Steam и дождитесь загрузки, затем повторите.',
    retryable: true,
  },
  STEAM_UNAVAILABLE: {
    title: 'Steam временно недоступен',
    sellerHint:
      'Подождите 1–2 минуты и повторите. Если ошибка сохраняется — проверьте статус Steam.',
    retryable: true,
  },
  STEAM_GUARD_REQUIRED: {
    title: 'Нужно подтвердить в Steam Guard',
    sellerHint:
      'Подтвердите обмен в мобильном приложении Steam. Не закрывайте вкладку до завершения.',
    retryable: true,
  },
  CONFIRM_PENDING: {
    title: 'Ожидается подтверждение Steam Guard',
    sellerHint: 'Откройте Steam Mobile и подтвердите trade offer.',
    retryable: true,
  },
  OFFER_SEND_FAILED: {
    title: 'Не удалось отправить trade offer',
    sellerHint:
      'Проверьте trade lock предмета, ограничения аккаунта и повторите отправку вручную при необходимости.',
    retryable: true,
  },
  OFFER_DRAFT_FAILED: {
    title: 'Не удалось подготовить offer',
    sellerHint:
      'Обновите страницу Steam и повторите. При повторе — отправьте offer вручную.',
    retryable: true,
  },
  STEAM_ACCOUNT_MISMATCH: {
    title: 'Другой Steam-аккаунт в браузере',
    sellerHint:
      'В Chrome залогинен не тот Steam, что привязан к аккаунту продавца на площадке.',
    retryable: false,
  },
  TRADE_HOLD_BLOCKED: {
    title: 'Trade hold блокирует обмен',
    sellerHint:
      'Steam не позволяет отправить offer из-за trade hold. Дождитесь снятия ограничения или отправьте вручную позже.',
    retryable: false,
  },
};
