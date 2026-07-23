import type { Notification } from '../api/types';
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

export type NotificationRecipientRole = 'buyer' | 'seller';

export const ACTION_REQUIRED_EVENT_TYPES = new Set([
  'TRADE_OPERATION_CREATED',
  'ORDER_DISPUTE_OPENED',
]);

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

function notifDisplay(key: string, locale: Locale): { title: string; message: string } {
  return {
    title: t(`notif.${key}.title`, locale),
    message: t(`notif.${key}.message`, locale),
  };
}

function getOrderCreatedDisplay(
  role: NotificationRecipientRole | null,
  locale: Locale,
): { title: string; message: string } {
  if (role === 'seller') {
    return notifDisplay('ORDER_CREATED_seller', locale);
  }
  return notifDisplay('ORDER_CREATED', locale);
}

function getTradeOperationDisplay(
  role: NotificationRecipientRole | null,
  locale: Locale,
): { title: string; message: string } {
  if (role === 'buyer') {
    return notifDisplay('TRADE_OPERATION_CREATED_buyer', locale);
  }
  return notifDisplay('TRADE_OPERATION_CREATED', locale);
}

const MAPPED_EVENT_TYPES = new Set([
  'ORDER_COMPLETED',
  'ORDER_FAILED',
  'ORDER_DISPUTE_OPENED',
  'BUY_REQUEST_MATCHED',
  'SALE_SETTLED',
  'SETTLEMENT_BLOCKED',
  'TRADE_SHADOW_MISMATCH',
  'RECONCILIATION_FAILED',
]);

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
  locale: Locale = 'ru',
): {
  title: string;
  message: string;
} {
  const role = getNotificationRecipientRole(notification, userId);

  if (notification.eventType === 'ORDER_CREATED') {
    return getOrderCreatedDisplay(role, locale);
  }
  if (notification.eventType === 'TRADE_OPERATION_CREATED') {
    return getTradeOperationDisplay(role, locale);
  }

  if (MAPPED_EVENT_TYPES.has(notification.eventType)) {
    return notifDisplay(notification.eventType, locale);
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

export const NOTIFICATION_CATEGORY_FILTER_IDS = ['all', 'deals', 'money', 'system'] as const;

export type NotificationCategoryFilterId = (typeof NOTIFICATION_CATEGORY_FILTER_IDS)[number];

/** @deprecated Prefer NOTIFICATION_CATEGORY_FILTER_IDS + t('notifications.category*') */
export const NOTIFICATION_CATEGORY_FILTER_OPTIONS = [
  { value: 'all', label: 'Все категории' },
  { value: 'deals', label: 'Сделки' },
  { value: 'money', label: 'Деньги' },
  { value: 'system', label: 'Система' },
] as const;

export const NOTIFICATION_EVENT_FILTER_IDS = [
  'all',
  'action_required',
  'ORDER_CREATED',
  'ORDER_COMPLETED',
  'ORDER_FAILED',
  'ORDER_DISPUTE_OPENED',
  'TRADE_OPERATION_CREATED',
  'SALE_SETTLED',
  'SETTLEMENT_BLOCKED',
] as const;

export type NotificationEventFilterId = (typeof NOTIFICATION_EVENT_FILTER_IDS)[number];

const NOTIFICATION_EVENT_FILTER_KEY_MAP: Record<string, string> = {
  all: 'notifications.eventsAll',
  action_required: 'notifications.eventsActionRequired',
  ORDER_CREATED: 'notifications.eventOrderCreated',
  ORDER_COMPLETED: 'notifications.eventOrderCompleted',
  ORDER_FAILED: 'notifications.eventOrderFailed',
  ORDER_DISPUTE_OPENED: 'notifications.eventOrderDispute',
  TRADE_OPERATION_CREATED: 'notifications.eventTradeOperation',
  SALE_SETTLED: 'notifications.eventSaleSettled',
  SETTLEMENT_BLOCKED: 'notifications.eventSettlementBlocked',
};

export function notificationEventFilterLabel(
  id: NotificationEventFilterId,
  locale: Locale = 'ru',
): string {
  return t(NOTIFICATION_EVENT_FILTER_KEY_MAP[id] ?? 'notifications.eventsAll', locale);
}

const NOTIFICATION_CATEGORY_FILTER_KEY_MAP: Record<string, string> = {
  all: 'notifications.categoriesAll',
  deals: 'notifications.categoryDeals',
  money: 'notifications.categoryMoney',
  system: 'notifications.categorySystem',
};

export function notificationCategoryFilterLabel(
  id: NotificationCategoryFilterId,
  locale: Locale = 'ru',
): string {
  return t(NOTIFICATION_CATEGORY_FILTER_KEY_MAP[id] ?? 'notifications.categoriesAll', locale);
}

/** @deprecated Prefer NOTIFICATION_EVENT_FILTER_IDS + notificationEventFilterLabel */
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
