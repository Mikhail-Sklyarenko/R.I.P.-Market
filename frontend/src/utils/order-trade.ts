import type { TradeOperation } from '../api/types';
import { enMessages } from '../i18n/messages/en.ts';
import { ruMessages } from '../i18n/messages/ru.ts';
import { translate } from '../i18n/translate.ts';
import type { Locale } from '../i18n/types.ts';

const messagesByLocale = {
  ru: ruMessages,
  en: enMessages,
} as const;

function t(key: string, locale: Locale, params?: Record<string, string | number>) {
  return translate(messagesByLocale[locale], key, params);
}

export const STEAM_INCOMING_OFFERS_URL = 'https://steamcommunity.com/my/tradeoffers/';

export function getSellerTradeInstructions(locale: Locale = 'ru'): string[] {
  return [
    t('orderTrade.instruction1', locale),
    t('orderTrade.instruction2', locale),
    t('orderTrade.instruction3', locale),
    t('orderTrade.instruction4', locale),
    t('orderTrade.instruction5', locale),
  ];
}

export function getBuyerTradeSafetyChecklist(locale: Locale = 'ru'): string[] {
  return [
    t('orderTrade.checklist1', locale),
    t('orderTrade.checklist2', locale),
    t('orderTrade.checklist3', locale),
  ];
}

/** @deprecated Prefer getSellerTradeInstructions(locale) */
export const SELLER_TRADE_INSTRUCTIONS = getSellerTradeInstructions('ru');

/** @deprecated Prefer getBuyerTradeSafetyChecklist(locale) */
export const BUYER_TRADE_SAFETY_CHECKLIST = getBuyerTradeSafetyChecklist('ru');

export function formatTradePollStatus(
  tradeOperation?: TradeOperation | null,
  locale: Locale = 'ru',
): string {
  if (!tradeOperation) {
    return '—';
  }

  if (tradeOperation.status === 'CONFIRMED' || tradeOperation.status === 'DELIVERY_VERIFIED') {
    return t('tradePollStatus.accepted', locale);
  }
  if (tradeOperation.status === 'FAILED_SAFE' || tradeOperation.status === 'FAILED_DISPUTE') {
    if (tradeOperation.failReasonCode === 'INVENTORY_UNKNOWN_EXHAUSTED') {
      return t('tradePollStatus.steamCheckFailed', locale);
    }
    if (tradeOperation.failReasonCode === 'OFFER_DECLINED') {
      return t('tradePollStatus.declined', locale);
    }
    if (tradeOperation.failReasonCode === 'OFFER_EXPIRED' || tradeOperation.failReasonCode === 'TRADE_TIMEOUT') {
      return t('tradePollStatus.expired', locale);
    }
    return tradeOperation.failReasonCode
      ? t('tradePollStatus.dispute', locale)
      : t('tradePollStatus.declined', locale);
  }
  if (tradeOperation.status === 'TIMEOUT') {
    return t('tradePollStatus.timeout', locale);
  }
  if (tradeOperation.status === 'WAITING') {
    if (tradeOperation.externalOfferId && (tradeOperation.checkCount ?? 0) > 0) {
      return t('tradePollStatus.checkingSteam', locale);
    }
    return t('tradePollStatus.waiting', locale);
  }

  return tradeOperation.status;
}

export function isOrderTradeDeliveryCheck(order: {
  tradeTask?: {
    status?: string | null;
    executionPhase?: string | null;
    lastErrorCode?: string | null;
  } | null;
}): boolean {
  const tradeTask = order.tradeTask;
  if (!tradeTask) {
    return false;
  }
  return (
    tradeTask.lastErrorCode === 'ITEM_ALREADY_GONE' ||
    ((tradeTask.status === 'FAILED' || tradeTask.executionPhase === 'OFFER_FAILED') &&
      tradeTask.lastErrorCode === 'ITEM_MISSING')
  );
}

export function getTradeTimeoutRemainingMinutes(
  orderCreatedAt: string,
  timeoutMinutes: number,
): number {
  const createdAt = new Date(orderCreatedAt).getTime();
  if (!Number.isFinite(createdAt)) {
    return 0;
  }
  const deadline = createdAt + timeoutMinutes * 60_000;
  return Math.max(0, Math.ceil((deadline - Date.now()) / 60_000));
}
