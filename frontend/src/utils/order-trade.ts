import type { TradeOperation } from '../api/types';

export const STEAM_INCOMING_OFFERS_URL = 'https://steamcommunity.com/my/tradeoffers/';

export const SELLER_TRADE_INSTRUCTIONS = [
  'Откройте Trade URL покупателя в Steam.',
  'Добавьте предмет из сделки в предложение обмена.',
  'Отправьте trade offer без лишних предметов с вашей стороны.',
  'Скопируйте ссылку на отправленное предложение и вставьте её ниже.',
  'Дождитесь принятия обмена покупателем — статус обновится автоматически.',
] as const;

export const BUYER_TRADE_SAFETY_CHECKLIST = [
  'Проверьте название скина и состояние (wear/float).',
  'Убедитесь, что в обмене только ожидаемый предмет.',
  'Не принимайте предложения с лишними предметами от продавца.',
] as const;

export function formatTradePollStatus(tradeOperation?: TradeOperation | null): string {
  if (!tradeOperation) {
    return '—';
  }

  if (tradeOperation.status === 'CONFIRMED') {
    return 'Принят';
  }
  if (tradeOperation.status === 'FAILED_SAFE' || tradeOperation.status === 'FAILED_DISPUTE') {
    return 'Отклонён';
  }
  if (tradeOperation.status === 'TIMEOUT') {
    return 'Таймаут';
  }
  if (tradeOperation.status === 'WAITING') {
    if (tradeOperation.externalOfferId && (tradeOperation.checkCount ?? 0) > 0) {
      return 'Проверяем Steam';
    }
    return 'Ожидание';
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
