import {
  isNotificationCategory,
  notificationCategoryPrefixes,
} from './notification-category.util';

describe('notificationCategoryPrefixes', () => {
  it('maps deals category to order and trade prefixes', () => {
    expect(notificationCategoryPrefixes('deals')).toEqual(['ORDER_', 'TRADE_']);
  });

  it('maps money category to sale and settlement prefixes', () => {
    expect(notificationCategoryPrefixes('money')).toEqual([
      'SALE_',
      'SETTLEMENT_',
    ]);
  });

  it('maps system category to reconciliation and shadow prefixes', () => {
    expect(notificationCategoryPrefixes('system')).toEqual([
      'RECONCILIATION_',
      'TRADE_SHADOW_',
    ]);
  });
});

describe('isNotificationCategory', () => {
  it('accepts known categories', () => {
    expect(isNotificationCategory('deals')).toBe(true);
    expect(isNotificationCategory('money')).toBe(true);
    expect(isNotificationCategory('system')).toBe(true);
  });

  it('rejects unknown values', () => {
    expect(isNotificationCategory('orders')).toBe(false);
  });
});
