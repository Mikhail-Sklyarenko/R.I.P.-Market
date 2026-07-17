import type { Order } from '../api/types';
import { isOrderTradeDeliveryCheck } from './order-trade.ts';

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

const STEP_LABELS: Record<string, string> = {
  CREATED: 'Создание сделки',
  PAYMENT_RESERVED: 'Резерв средств',
  WAITING_TRADE: 'Обмен в Steam',
  TRADE_CONFIRMED: 'Подтверждение обмена',
  SETTLEMENT_HOLD: 'Проверка (8 дней)',
  COMPLETED: 'Завершение',
};

function resolveHappyPath(status: string): readonly string[] {
  if (status === 'SETTLEMENT_HOLD') {
    return HAPPY_PATH_WITH_HOLD;
  }
  if (status === 'COMPLETED') {
    return HAPPY_PATH_WITH_HOLD;
  }
  return HAPPY_PATH;
}

export function formatOrderStatus(status: string): string {
  return ORDER_STATUS_LABELS[status] ?? status;
}

export function getOrderSteps(status: string): OrderStep[] {
  const path = resolveHappyPath(status);

  if (status === 'COMPLETED') {
    return path.map((key) => ({
      key,
      label: STEP_LABELS[key],
      state: 'done' as const,
    }));
  }

  if (status === 'CANCELED' || status === 'FAILED' || status === 'DISPUTE') {
    const failIndex = path.indexOf('WAITING_TRADE');
    return path.map((key, index) => ({
      key,
      label: STEP_LABELS[key],
      state:
        index < failIndex ? 'done' : index === failIndex ? 'failed' : 'upcoming',
    }));
  }

  const currentIndex = Math.max(path.indexOf(status), 0);

  return path.map((key, index) => ({
    key,
    label: STEP_LABELS[key],
    state:
      index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'upcoming',
  }));
}

export function getOrderNextAction(
  order: Order,
  role: 'buyer' | 'seller' | 'other',
): { title: string; description: string } | null {
  if (order.status === 'COMPLETED') {
    return {
      title: 'Сделка завершена',
      description: 'Средства переведены продавцу. Предмет у вас в инвентаре Steam.',
    };
  }
  if (order.status === 'CANCELED') {
    return {
      title: 'Сделка отменена',
      description: 'Зарезервированные средства возвращены на кошелёк.',
    };
  }
  if (order.status === 'FAILED') {
    return {
      title: 'Сделка не состоялась',
      description: 'Средства возвращены покупателю, лот снова в каталоге.',
    };
  }
  if (order.status === 'DISPUTE') {
    return {
      title: 'Открыт спор',
      description: 'Команда поддержки рассмотрит ситуацию и примет решение.',
    };
  }

  if (role === 'buyer') {
    if (order.status === 'WAITING_TRADE') {
      if (isOrderTradeDeliveryCheck(order)) {
        return {
          title: 'Проверьте предмет в Steam',
          description:
            'Обмен мог уже пройти. Откройте инвентарь Steam — платформа сверит доставку сама.',
        };
      }
      if (!order.tradeOperation?.externalOfferId) {
        return {
          title: 'Ждём обмен от продавца',
          description:
            'Продавец отправляет trade offer. Обычно это занимает 1–2 минуты — страница обновится сама.',
        };
      }
      return {
        title: 'Примите обмен в Steam',
        description:
          'Откройте входящие предложения, проверьте скин и примите обмен. Сайт обновится сам.',
      };
    }
    if (order.status === 'TRADE_CONFIRMED') {
      return {
        title: 'Обмен подтверждён',
        description: 'Платформа завершает проверку. Страница обновится автоматически.',
      };
    }
    if (order.status === 'SETTLEMENT_HOLD') {
      return {
        title: 'Проверка сделки',
        description:
          'Обмен подтверждён. Выплата продавцу будет доступна после 8-дневного периода проверки.',
      };
    }
    return {
      title: 'Ожидайте',
      description: 'Сделка обрабатывается. Статус обновится автоматически.',
    };
  }

  if (role === 'seller') {
    if (order.status === 'WAITING_TRADE') {
      if (isOrderTradeDeliveryCheck(order)) {
        return {
          title: 'Проверяем доставку',
          description:
            'Предмет уже ушёл из вашего инвентаря. Не отправляйте новый обмен — платформа сверяет покупателя.',
        };
      }
      if (!order.tradeOperation?.externalOfferId) {
        return {
          title: 'Ждём автоотправку',
          description:
            'Расширение само отправит обмен. Если Steam попросит — подтвердите в приложении на телефоне.',
        };
      }
      if (!order.tradeAcknowledgments?.sellerAckSent) {
        return {
          title: 'Подтвердите в Steam Guard',
          description:
            'Если Steam прислал запрос — подтвердите на телефоне. Дальше ждём принятия покупателем.',
        };
      }
      return {
        title: 'Ждём покупателя',
        description:
          'Обмен ушёл. Покупатель должен принять его во входящих предложениях Steam.',
      };
    }
    if (order.status === 'TRADE_CONFIRMED') {
      return {
        title: 'Обмен подтверждён',
        description: 'Ожидаем выплату на ваш кошелёк.',
      };
    }
    if (order.status === 'SETTLEMENT_HOLD') {
      return {
        title: 'Проверка сделки',
        description:
          'Сделка подтверждена. Средства будут зачислены после окончания 8-дневной проверки.',
      };
    }
    return {
      title: 'Ожидайте',
      description: 'Сделка обрабатывается.',
    };
  }

  return null;
}

export type DealFlowStepItem = {
  key: string;
  title: string;
  description: string;
};

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
