import type { Notification } from '../api/types';

export type NotificationRecipientRole = 'buyer' | 'seller';

export const ACTION_REQUIRED_EVENT_TYPES = new Set([
  'TRADE_OPERATION_CREATED',
  'ORDER_DISPUTE_OPENED',
]);

export const NOTIFICATION_EVENT_LABELS: Record<
  string,
  { title: string; message: string }
> = {
  ORDER_CREATED: {
    title: 'Сделка оформлена',
    message: 'Средства зарезервированы. Дождитесь trade offer от продавца.',
  },
  TRADE_OPERATION_CREATED: {
    title: 'Отправьте trade offer',
    message: 'Передайте предмет покупателю в Steam для завершения сделки.',
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
    message: 'Откройте сделку и следуйте инструкциям поддержки.',
  },
  BUY_REQUEST_MATCHED: {
    title: 'Появилось предложение',
    message: 'По вашей заявке выставлен новый лот. Успейте купить — предложение может забрать другой.',
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
    message: 'Обнаружено несоответствие статуса обмена. Откройте сделку для проверки.',
  },
  RECONCILIATION_FAILED: {
    title: 'Ошибка сверки ledger',
    message: 'При сверке балансов обнаружены расхождения.',
  },
};

const WALLET_LINK_EVENT_TYPES = new Set(['SALE_SETTLED', 'SETTLEMENT_BLOCKED']);

function readPayloadRecord(
  value: unknown,
): Record<string, unknown> | null {
  if (typeof value === 'object' && value !== null) {
    return value as Record<string, unknown>;
  }
  return null;
}

export function getNotificationRecipientRole(
  notification: Notification,
  userId?: string | null,
): NotificationRecipientRole | null {
  const payload = notification.payload;
  const explicitRole = payload?.role;
  if (explicitRole === 'buyer' || explicitRole === 'seller') {
    return explicitRole;
  }

  if (!userId) {
    return null;
  }

  const outboxPayload = readPayloadRecord(payload?.outboxPayload);
  if (outboxPayload) {
    if (outboxPayload.buyerId === userId) {
      return 'buyer';
    }
    if (outboxPayload.sellerId === userId) {
      return 'seller';
    }
  }

  return null;
}

function getOrderCreatedDisplay(role: NotificationRecipientRole | null): {
  title: string;
  message: string;
} {
  if (role === 'seller') {
    return {
      title: 'Новая покупка',
      message: 'Покупатель оплатил лот — отправьте trade offer в Steam.',
    };
  }
  return {
    title: 'Сделка оформлена',
    message: 'Средства зарезервированы. Дождитесь trade offer от продавца.',
  };
}

function getTradeOperationDisplay(role: NotificationRecipientRole | null): {
  title: string;
  message: string;
} {
  if (role === 'buyer') {
    return {
      title: 'Примите обмен в Steam',
      message: 'Продавец готов передать предмет — примите trade offer.',
    };
  }
  return NOTIFICATION_EVENT_LABELS.TRADE_OPERATION_CREATED;
}

export function isActionRequiredNotification(
  notification: Notification,
  userId?: string | null,
): boolean {
  if (notification.eventType === 'ORDER_CREATED') {
    return getNotificationRecipientRole(notification, userId) === 'buyer';
  }
  return ACTION_REQUIRED_EVENT_TYPES.has(notification.eventType);
}

export function getNotificationDisplay(
  notification: Notification,
  userId?: string | null,
): {
  title: string;
  message: string;
} {
  const role = getNotificationRecipientRole(notification, userId);

  if (notification.eventType === 'ORDER_CREATED') {
    return getOrderCreatedDisplay(role);
  }
  if (notification.eventType === 'TRADE_OPERATION_CREATED') {
    return getTradeOperationDisplay(role);
  }

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
  if (notification.eventType === 'BUY_REQUEST_MATCHED') {
    const lotId = notification.payload?.lotId;
    if (typeof lotId === 'string' && lotId.length > 0) {
      return `/lots/${lotId}`;
    }
  }

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
  { value: 'action_required', label: 'Требуют действия' },
  { value: 'ORDER_CREATED', label: 'Создание сделки' },
  { value: 'ORDER_COMPLETED', label: 'Завершение' },
  { value: 'ORDER_FAILED', label: 'Неудача' },
  { value: 'ORDER_DISPUTE_OPENED', label: 'Спор' },
  { value: 'TRADE_OPERATION_CREATED', label: 'Обмен' },
  { value: 'SALE_SETTLED', label: 'Выплата' },
  { value: 'SETTLEMENT_BLOCKED', label: 'Блокировка расчёта' },
] as const;
