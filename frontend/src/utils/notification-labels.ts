import type { Notification } from '../api/types';

export const NOTIFICATION_EVENT_LABELS: Record<
  string,
  { title: string; message: string }
> = {
  ORDER_CREATED: {
    title: 'Сделка создана',
    message: 'Заказ оформлен, средства зарезервированы.',
  },
  TRADE_OPERATION_CREATED: {
    title: 'Нужен обмен в Steam',
    message: 'Передайте предмет покупателю для завершения сделки.',
  },
  ORDER_COMPLETED: {
    title: 'Сделка завершена',
    message: 'Обмен подтверждён, сделка успешно закрыта.',
  },
  ORDER_FAILED: {
    title: 'Сделка не состоялась',
    message: 'Сделка завершилась неуспешно. Средства возвращены при необходимости.',
  },
  ORDER_DISPUTE_OPENED: {
    title: 'Открыт спор',
    message: 'По сделке открыт спор. Ожидайте решения поддержки.',
  },
  SALE_SETTLED: {
    title: 'Выплата за продажу',
    message: 'Средства за продажу зачислены на кошелёк.',
  },
  SETTLEMENT_BLOCKED: {
    title: 'Расчёт заблокирован',
    message: 'Обмен подтверждён, но выплата заблокирована лимитами политики.',
  },
  TRADE_SHADOW_MISMATCH: {
    title: 'Расхождение trade-статуса',
    message: 'Обнаружено несоответствие статуса обмена. Требуется проверка.',
  },
  RECONCILIATION_FAILED: {
    title: 'Ошибка сверки ledger',
    message: 'При сверке балансов обнаружены расхождения.',
  },
};

const WALLET_LINK_EVENT_TYPES = new Set(['SALE_SETTLED', 'SETTLEMENT_BLOCKED']);

export function getNotificationDisplay(notification: Notification): {
  title: string;
  message: string;
} {
  const mapped = NOTIFICATION_EVENT_LABELS[notification.eventType];
  if (mapped) {
    return mapped;
  }
  if (notification.title && notification.title !== notification.eventType) {
    return {
      title: notification.title,
      message: notification.message,
    };
  }
  return {
    title: notification.eventType,
    message: notification.message,
  };
}

export function getNotificationOrderId(notification: Notification): string | null {
  const orderId = notification.payload?.orderId;
  if (typeof orderId === 'string' && orderId.length > 0) {
    return orderId;
  }
  return null;
}

export function getNotificationTargetPath(notification: Notification): string | null {
  const orderId = getNotificationOrderId(notification);
  if (orderId) {
    return `/orders/${orderId}`;
  }
  if (WALLET_LINK_EVENT_TYPES.has(notification.eventType)) {
    return '/wallet';
  }
  return null;
}

export const NOTIFICATION_CATEGORY_FILTER_OPTIONS = [
  { value: 'all', label: 'Все категории' },
  { value: 'deals', label: 'Сделки' },
  { value: 'money', label: 'Деньги' },
  { value: 'system', label: 'Система' },
] as const;

export const NOTIFICATION_EVENT_FILTER_OPTIONS = [
  { value: 'all', label: 'Все типы' },
  { value: 'ORDER_CREATED', label: 'Создание сделки' },
  { value: 'ORDER_COMPLETED', label: 'Завершение' },
  { value: 'ORDER_FAILED', label: 'Неудача' },
  { value: 'ORDER_DISPUTE_OPENED', label: 'Спор' },
  { value: 'TRADE_OPERATION_CREATED', label: 'Обмен' },
  { value: 'SALE_SETTLED', label: 'Выплата' },
  { value: 'SETTLEMENT_BLOCKED', label: 'Блокировка расчёта' },
] as const;
