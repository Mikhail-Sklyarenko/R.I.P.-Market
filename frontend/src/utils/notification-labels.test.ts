import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Notification } from '../api/types.ts';
import {
  getNotificationDisplay,
  getNotificationRecipientRole,
  isActionRequiredNotification,
} from './notification-labels.ts';

function notification(
  partial: Partial<Notification> & Pick<Notification, 'eventType'>,
): Notification {
  return {
    id: 'n1',
    title: partial.title ?? partial.eventType,
    message: partial.message ?? '',
    readAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

describe('notification-labels utils', () => {
  it('detects buyer role from outbox payload', () => {
    const item = notification({
      eventType: 'ORDER_CREATED',
      payload: {
        orderId: 'o1',
        outboxPayload: { buyerId: 'buyer-1', sellerId: 'seller-1' },
      },
    });

    assert.equal(getNotificationRecipientRole(item, 'buyer-1'), 'buyer');
    assert.equal(getNotificationRecipientRole(item, 'seller-1'), 'seller');
  });

  it('uses action-oriented trade copy for seller', () => {
    const item = notification({
      eventType: 'TRADE_OPERATION_CREATED',
      payload: {
        orderId: 'o1',
        outboxPayload: { buyerId: 'buyer-1', sellerId: 'seller-1' },
      },
    });

    const display = getNotificationDisplay(item, 'seller-1');
    assert.match(display.title, /trade offer/i);
    assert.match(display.message, /Steam/i);
  });

  it('marks buyer order created and trade events as action required', () => {
    const buyerOrder = notification({
      eventType: 'ORDER_CREATED',
      payload: {
        orderId: 'o1',
        outboxPayload: { buyerId: 'buyer-1', sellerId: 'seller-1' },
      },
    });
    const sellerOrder = notification({
      eventType: 'ORDER_CREATED',
      payload: {
        orderId: 'o2',
        outboxPayload: { buyerId: 'buyer-1', sellerId: 'seller-1' },
      },
    });
    const trade = notification({ eventType: 'TRADE_OPERATION_CREATED' });
    const completed = notification({ eventType: 'ORDER_COMPLETED' });

    assert.equal(isActionRequiredNotification(buyerOrder, 'buyer-1'), true);
    assert.equal(isActionRequiredNotification(sellerOrder, 'seller-1'), false);
    assert.equal(isActionRequiredNotification(trade, 'seller-1'), true);
    assert.equal(isActionRequiredNotification(completed, 'buyer-1'), false);
  });
});
