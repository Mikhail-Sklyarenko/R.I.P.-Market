export type NotificationCategory = 'deals' | 'money' | 'system';

const CATEGORY_PREFIXES: Record<NotificationCategory, string[]> = {
  deals: ['ORDER_', 'TRADE_', 'BUY_REQUEST_'],
  money: ['SALE_', 'SETTLEMENT_'],
  system: ['RECONCILIATION_', 'TRADE_SHADOW_', 'OPS_', 'EXTENSION_'],
};

export function notificationCategoryPrefixes(
  category: NotificationCategory,
): string[] {
  return CATEGORY_PREFIXES[category];
}

export function isNotificationCategory(
  value: string,
): value is NotificationCategory {
  return value === 'deals' || value === 'money' || value === 'system';
}
