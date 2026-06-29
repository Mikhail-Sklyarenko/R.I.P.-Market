import type { Order } from '../api/types';

export const ORDER_STATUS_LABELS: Record<string, string> = {
  CREATED: 'Сделка создана',
  PAYMENT_RESERVED: 'Средства зарезервированы',
  WAITING_TRADE: 'Ожидание обмена в Steam',
  TRADE_CONFIRMED: 'Обмен подтверждён',
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

const STEP_LABELS: Record<string, string> = {
  CREATED: 'Создание сделки',
  PAYMENT_RESERVED: 'Резерв средств',
  WAITING_TRADE: 'Обмен в Steam',
  TRADE_CONFIRMED: 'Подтверждение',
  COMPLETED: 'Завершение',
};

export function formatOrderStatus(status: string): string {
  return ORDER_STATUS_LABELS[status] ?? status;
}

export function getOrderSteps(status: string): OrderStep[] {
  if (status === 'COMPLETED') {
    return HAPPY_PATH.map((key) => ({
      key,
      label: STEP_LABELS[key],
      state: 'done' as const,
    }));
  }

  if (status === 'CANCELED' || status === 'FAILED' || status === 'DISPUTE') {
    const failIndex = HAPPY_PATH.indexOf('WAITING_TRADE');
    return HAPPY_PATH.map((key, index) => ({
      key,
      label: STEP_LABELS[key],
      state:
        index < failIndex ? 'done' : index === failIndex ? 'failed' : 'upcoming',
    }));
  }

  const currentIndex = Math.max(
    HAPPY_PATH.indexOf(status as (typeof HAPPY_PATH)[number]),
    0,
  );

  return HAPPY_PATH.map((key, index) => ({
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
      return {
        title: 'Примите обмен в Steam',
        description:
          'Продавец отправит trade offer. Примите его в клиенте Steam или на сайте.',
      };
    }
    if (order.status === 'TRADE_CONFIRMED') {
      return {
        title: 'Обмен подтверждён',
        description: 'Ожидаем финального расчёта. Страница обновится автоматически.',
      };
    }
    return {
      title: 'Ожидайте',
      description: 'Сделка обрабатывается. Статус обновится автоматически.',
    };
  }

  if (role === 'seller') {
    if (order.status === 'WAITING_TRADE') {
      return {
        title: 'Отправьте обмен в Steam',
        description:
          'Отправьте trade offer покупателю и укажите ID или ссылку на предложение ниже.',
      };
    }
    if (order.status === 'TRADE_CONFIRMED') {
      return {
        title: 'Обмен подтверждён',
        description: 'Ожидаем выплату на ваш кошелёк.',
      };
    }
    return {
      title: 'Ожидайте',
      description: 'Сделка обрабатывается.',
    };
  }

  return null;
}

export const DEAL_FLOW_STEPS = [
  'Подтверждаете покупку — средства резервируются (hold) на кошельке.',
  'Продавец отправляет trade offer в Steam.',
  'Вы принимаете обмен — только после этого средства переводятся продавцу.',
  'Если обмен не состоялся — hold снимается, деньги возвращаются.',
] as const;
