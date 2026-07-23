import type { Order } from '../api/types';
import { enMessages } from '../i18n/messages/en.ts';
import { ruMessages } from '../i18n/messages/ru.ts';
import { translate } from '../i18n/translate.ts';
import type { Locale } from '../i18n/types.ts';
import { isOrderTradeDeliveryCheck } from './order-trade.ts';

const messagesByLocale = {
  ru: ruMessages,
  en: enMessages,
} as const;

function t(key: string, locale: Locale, params?: Record<string, string | number>) {
  return translate(messagesByLocale[locale], key, params);
}

/** @deprecated Prefer formatOrderStatus(status, locale) */
export const ORDER_STATUS_LABELS: Record<string, string> = {
  CREATED: 'Сделка создана',
  PAYMENT_RESERVED: 'Средства зарезервированы',
  WAITING_TRADE: 'Ждём обмен в Steam',
  TRADE_CONFIRMED: 'Обмен подтверждён',
  SETTLEMENT_HOLD: 'Проверка сделки (до 8 дней)',
  COMPLETED: 'Сделка завершена',
  CANCELED: 'Сделка отменена',
  FAILED: 'Сделка не состоялась',
  DISPUTE: 'Открыт спор',
};

/** @deprecated Prefer formatOrderStatusCompact(status, locale). Compact labels for deals table. */
export const ORDER_STATUS_LABELS_COMPACT: Record<string, string> = {
  CREATED: 'Создана',
  PAYMENT_RESERVED: 'Средства в резерве',
  WAITING_TRADE: 'Обмен в Steam',
  TRADE_CONFIRMED: 'Обмен подтверждён',
  SETTLEMENT_HOLD: 'На проверке',
  COMPLETED: 'Завершена',
  CANCELED: 'Отменена',
  FAILED: 'Не состоялась',
  DISPUTE: 'Спор',
};

export function formatOrderStatus(status: string, locale: Locale = 'ru'): string {
  const key = `orderStatus.${status}`;
  const translated = t(key, locale);
  if (translated !== key) {
    return translated;
  }
  return ORDER_STATUS_LABELS[status] ?? status;
}

export function formatOrderStatusCompact(status: string, locale: Locale = 'ru'): string {
  const key = `orderStatusCompact.${status}`;
  const translated = t(key, locale);
  if (translated !== key) {
    return translated;
  }
  return ORDER_STATUS_LABELS_COMPACT[status] ?? ORDER_STATUS_LABELS[status] ?? status;
}

export type OrderStep = {
  key: string;
  label: string;
  state: 'done' | 'current' | 'upcoming' | 'failed';
};

const HAPPY_PATH = [
  'CREATED',
  'PAYMENT_RESERVED',
  'WAITING_TRADE',
  'TRADE_CONFIRMED',
  'COMPLETED',
] as const;

const HAPPY_PATH_WITH_HOLD = [
  'CREATED',
  'PAYMENT_RESERVED',
  'WAITING_TRADE',
  'TRADE_CONFIRMED',
  'SETTLEMENT_HOLD',
  'COMPLETED',
] as const;

/** @deprecated Prefer getOrderSteps(status, locale) — RU snapshot for older callers/tests. */
export const STEP_LABELS: Record<string, string> = {
  CREATED: 'Создание сделки',
  PAYMENT_RESERVED: 'Резерв средств',
  WAITING_TRADE: 'Обмен в Steam',
  TRADE_CONFIRMED: 'Подтверждение обмена',
  SETTLEMENT_HOLD: 'Проверка (8 дней)',
  COMPLETED: 'Завершение',
};

function stepLabel(key: string, locale: Locale): string {
  const dictKey = `orderStep.${key}`;
  const translated = t(dictKey, locale);
  if (translated !== dictKey) {
    return translated;
  }
  return STEP_LABELS[key] ?? key;
}

function resolveHappyPath(status: string): readonly string[] {
  if (status === 'SETTLEMENT_HOLD') {
    return HAPPY_PATH_WITH_HOLD;
  }
  if (status === 'COMPLETED') {
    return HAPPY_PATH_WITH_HOLD;
  }
  return HAPPY_PATH;
}

export function getOrderSteps(status: string, locale: Locale = 'ru'): OrderStep[] {
  const path = resolveHappyPath(status);

  if (status === 'COMPLETED') {
    return path.map((key) => ({
      key,
      label: stepLabel(key, locale),
      state: 'done' as const,
    }));
  }

  if (status === 'CANCELED' || status === 'FAILED' || status === 'DISPUTE') {
    const failIndex = path.indexOf('WAITING_TRADE');
    return path.map((key, index) => ({
      key,
      label: stepLabel(key, locale),
      state:
        index < failIndex ? 'done' : index === failIndex ? 'failed' : 'upcoming',
    }));
  }

  const currentIndex = Math.max(path.indexOf(status), 0);

  return path.map((key, index) => ({
    key,
    label: stepLabel(key, locale),
    state:
      index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'upcoming',
  }));
}

export function getOrderNextAction(
  order: Order,
  role: 'buyer' | 'seller' | 'other',
  locale: Locale = 'ru',
): { title: string; description: string } | null {
  const tr = (key: string, params?: Record<string, string | number>) => t(key, locale, params);

  if (order.status === 'COMPLETED') {
    if (role === 'seller') {
      return {
        title: tr('orderNextAction.completedTitle'),
        description: tr('orderNextAction.completedSellerBody'),
      };
    }
    return {
      title: tr('orderNextAction.completedTitle'),
      description: tr('orderNextAction.completedBuyerBody'),
    };
  }
  if (order.status === 'SETTLEMENT_HOLD') {
    if (role === 'seller') {
      return {
        title: tr('orderNextAction.settlementHoldSellerTitle'),
        description: tr('orderNextAction.settlementHoldSellerBody'),
      };
    }
    return {
      title: tr('orderNextAction.settlementHoldBuyerTitle'),
      description: tr('orderNextAction.settlementHoldBuyerBody'),
    };
  }
  if (order.status === 'CANCELED') {
    return {
      title: tr('orderNextAction.canceledTitle'),
      description: tr('orderNextAction.canceledBody'),
    };
  }
  if (order.status === 'FAILED') {
    return {
      title: tr('orderNextAction.failedTitle'),
      description: tr('orderNextAction.failedBody'),
    };
  }
  if (order.status === 'DISPUTE') {
    return {
      title: tr('orderNextAction.disputeTitle'),
      description: tr('orderNextAction.disputeBody'),
    };
  }

  if (role === 'buyer') {
    if (order.status === 'WAITING_TRADE') {
      if (isOrderTradeDeliveryCheck(order)) {
        return {
          title: tr('orderNextAction.buyerCheckItemTitle'),
          description: tr('orderNextAction.buyerCheckItemBody'),
        };
      }
      if (!order.tradeOperation?.externalOfferId) {
        return {
          title: tr('orderNextAction.buyerAwaitingOfferTitle'),
          description: tr('orderNextAction.buyerAwaitingOfferBody'),
        };
      }
      return {
        title: tr('orderNextAction.buyerAcceptTitle'),
        description: tr('orderNextAction.buyerAcceptBody'),
      };
    }
    if (order.status === 'TRADE_CONFIRMED') {
      return {
        title: tr('orderNextAction.tradeConfirmedTitle'),
        description: tr('orderNextAction.tradeConfirmedBuyerBody'),
      };
    }
    if (order.status === 'SETTLEMENT_HOLD') {
      return {
        title: tr('orderNextAction.settlementHoldBuyerTitle'),
        description: tr('orderNextAction.settlementHoldBuyerBody2'),
      };
    }
    return {
      title: tr('orderNextAction.waitTitle'),
      description: tr('orderNextAction.waitBody'),
    };
  }

  if (role === 'seller') {
    if (order.status === 'WAITING_TRADE') {
      if (isOrderTradeDeliveryCheck(order)) {
        return {
          title: tr('orderNextAction.sellerCheckingDeliveryTitle'),
          description: tr('orderNextAction.sellerCheckingDeliveryBody'),
        };
      }
      if (!order.tradeOperation?.externalOfferId) {
        return {
          title: tr('orderNextAction.sellerAwaitingAutoSendTitle'),
          description: tr('orderNextAction.sellerAwaitingAutoSendBody'),
        };
      }
      if (!order.tradeAcknowledgments?.sellerAckSent) {
        return {
          title: tr('orderNextAction.sellerConfirmGuardTitle'),
          description: tr('orderNextAction.sellerConfirmGuardBody'),
        };
      }
      return {
        title: tr('orderNextAction.sellerAwaitingBuyerTitle'),
        description: tr('orderNextAction.sellerAwaitingBuyerBody'),
      };
    }
    if (order.status === 'TRADE_CONFIRMED') {
      return {
        title: tr('orderNextAction.tradeConfirmedTitle'),
        description: tr('orderNextAction.tradeConfirmedSellerBody'),
      };
    }
    if (order.status === 'SETTLEMENT_HOLD') {
      return {
        title: tr('orderNextAction.settlementHoldSellerTitle'),
        description: tr('orderNextAction.settlementHoldSellerBody2'),
      };
    }
    return {
      title: tr('orderNextAction.waitTitle'),
      description: tr('orderNextAction.sellerWaitBody'),
    };
  }

  return null;
}

export type DealFlowStepItem = {
  key: string;
  title: string;
  description: string;
};

/** @deprecated Prefer getDealFlowSteps(locale) — RU snapshot for older callers/tests. */
export const DEAL_FLOW_STEP_ITEMS: readonly DealFlowStepItem[] = [
  {
    key: 'reserve',
    title: 'Резерв средств',
    description: 'Подтверждаете покупку — средства резервируются (hold) на кошельке.',
  },
  {
    key: 'trade-offer',
    title: 'Обмен в Steam',
    description: 'Продавец отправляет trade offer в Steam.',
  },
  {
    key: 'accept',
    title: 'Принятие обмена',
    description: 'Вы принимаете обмен — только после этого средства переводятся продавцу.',
  },
  {
    key: 'refund',
    title: 'Возврат при сбое',
    description: 'Если обмен не состоялся — hold снимается, деньги возвращаются.',
  },
] as const;

/** @deprecated Prefer getBuyRequestFlowSteps(locale) — RU snapshot for older callers/tests. */
export const BUY_REQUEST_FLOW_STEP_ITEMS: readonly DealFlowStepItem[] = [
  {
    key: 'request',
    title: 'Оставляете заявку',
    description: 'Укажите максимальную цену или следите за любыми предложениями.',
  },
  {
    key: 'notify',
    title: 'Получаете уведомление',
    description: 'Когда появится подходящий лот — мы сразу сообщим в приложении.',
  },
  {
    key: 'choose',
    title: 'Выбираете лот',
    description: 'Смотрите float, стикеры и цену — и открываете конкретное предложение.',
  },
  {
    key: 'buy',
    title: 'Покупаете как обычно',
    description: 'Дальше стандартная покупка: резерв средств и обмен в Steam.',
  },
] as const;

export const DEAL_FLOW_STEPS = DEAL_FLOW_STEP_ITEMS.map((step) => step.description);

function buildSteps(keys: readonly string[], namespace: string, locale: Locale): DealFlowStepItem[] {
  return keys.map((key) => ({
    key,
    title: t(`${namespace}.${key}.title`, locale),
    description: t(`${namespace}.${key}.description`, locale),
  }));
}

export function getDealFlowSteps(locale: Locale = 'ru'): DealFlowStepItem[] {
  const keys = DEAL_FLOW_STEP_ITEMS.map((step) => step.key);
  const steps = buildSteps(keys, 'dealFlowStep', locale);
  return steps.map((step, index) => ({
    ...step,
    title: step.title !== `dealFlowStep.${step.key}.title` ? step.title : DEAL_FLOW_STEP_ITEMS[index].title,
    description:
      step.description !== `dealFlowStep.${step.key}.description`
        ? step.description
        : DEAL_FLOW_STEP_ITEMS[index].description,
  }));
}

export function getBuyRequestFlowSteps(locale: Locale = 'ru'): DealFlowStepItem[] {
  const keys = BUY_REQUEST_FLOW_STEP_ITEMS.map((step) => step.key);
  const steps = buildSteps(keys, 'buyRequestFlowStep', locale);
  return steps.map((step, index) => ({
    ...step,
    title:
      step.title !== `buyRequestFlowStep.${step.key}.title`
        ? step.title
        : BUY_REQUEST_FLOW_STEP_ITEMS[index].title,
    description:
      step.description !== `buyRequestFlowStep.${step.key}.description`
        ? step.description
        : BUY_REQUEST_FLOW_STEP_ITEMS[index].description,
  }));
}
