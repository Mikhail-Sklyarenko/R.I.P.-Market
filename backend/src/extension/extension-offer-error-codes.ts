export const ExtensionOfferErrorCode = {
  BUYER_TRADE_URL_INVALID: 'BUYER_TRADE_URL_INVALID',
  BUYER_TRADE_URL_MISSING: 'BUYER_TRADE_URL_MISSING',
  ITEM_MISSING: 'ITEM_MISSING',
  ITEM_ALREADY_GONE: 'ITEM_ALREADY_GONE',
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
      'Проверьте, что предмет ещё в Steam-инвентаре. Если вы уже отправили и приняли обмен — дождитесь проверки доставки.',
    retryable: true,
  },
  ITEM_ALREADY_GONE: {
    title: 'Предмет уже ушёл из инвентаря продавца',
    sellerHint:
      'Похоже, обмен уже прошёл в Steam. Не отправляйте новый offer — платформа проверяет доставку покупателю.',
    retryable: false,
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
    title: 'Steam временно недоступен или отклонил API-отправку',
    sellerHint:
      'Часто это Trade Protected: расширение должно само открыть страницу обмена и добавить предмет. Обновите расширение, откройте steamcommunity.com под аккаунтом продавца и повторите. Затем подтвердите обмен в Steam Guard.',
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

/** Phases where ITEM_MISSING usually means the skin already left via Steam trade. */
const ITEM_GONE_AFTER_PHASES = new Set([
  'OFFER_DRAFTED',
  'ITEM_SELECTED',
  'OFFER_SUBMITTED',
  'CONFIRM_PENDING',
]);

export function resolveOfferFailureReason(
  reasonCode: string | null | undefined,
  executionPhase: string | null | undefined,
): ExtensionOfferErrorCodeType {
  const raw = (reasonCode ?? 'OFFER_SEND_FAILED') as ExtensionOfferErrorCodeType;
  if (
    raw === ExtensionOfferErrorCode.ITEM_MISSING &&
    executionPhase &&
    ITEM_GONE_AFTER_PHASES.has(executionPhase)
  ) {
    return ExtensionOfferErrorCode.ITEM_ALREADY_GONE;
  }
  if (raw in OFFER_ERROR_UX_HINTS) {
    return raw;
  }
  return ExtensionOfferErrorCode.OFFER_SEND_FAILED;
}

export function isOfferErrorRetryable(
  reasonCode: string | null | undefined,
  executionPhase: string | null | undefined,
): boolean {
  const resolved = resolveOfferFailureReason(reasonCode, executionPhase);
  return OFFER_ERROR_UX_HINTS[resolved]?.retryable ?? true;
}

export function shouldTriggerDeliveryCheckAfterOfferFailure(
  reasonCode: string | null | undefined,
): boolean {
  return (
    reasonCode === ExtensionOfferErrorCode.ITEM_ALREADY_GONE ||
    reasonCode === ExtensionOfferErrorCode.ITEM_MISSING
  );
}
