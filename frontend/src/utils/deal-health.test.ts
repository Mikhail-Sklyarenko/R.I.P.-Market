import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveDealHealth } from './deal-health.ts';
import type { Order } from '../api/types.ts';

function baseOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    lotId: 'lot-1',
    buyerId: 'buyer-1',
    sellerId: 'seller-1',
    status: 'WAITING_TRADE',
    amountMinor: '1000',
    holdAmountMinor: '1000',
    createdAt: '2026-08-26T12:00:00.000Z',
    lot: {
      id: 'lot-1',
      status: 'RESERVED',
      priceMinor: '1000',
      commissionMinor: '0',
      sellerReceiveMinor: '1000',
      createdAt: '2026-08-26T12:00:00.000Z',
      inventoryAsset: {
        id: 'asset-1',
        status: 'RESERVED',
        tradable: true,
        floatValue: null,
        itemDefinition: {
          marketHashName: 'AK-47 | Redline (Field-Tested)',
        },
      },
    },
    tradeOperation: {
      id: 'op-1',
      status: 'WAITING',
      externalOfferId: null,
    },
    tradeTask: {
      id: 'task-1',
      type: 'create_offer',
      status: 'IN_PROGRESS',
      executionPhase: 'ITEM_SELECTED',
      lastErrorCode: null,
      attemptCount: 1,
      maxAttempts: 5,
      expiresAt: '2026-08-26T13:00:00.000Z',
      createdAt: '2026-08-26T12:00:00.000Z',
      updatedAt: '2026-08-26T12:00:00.000Z',
    },
    ...overrides,
  } as Order;
}

describe('resolveDealHealth', () => {
  it('shows auto-send ok for healthy seller task', () => {
    const health = resolveDealHealth({
      order: baseOrder(),
      role: 'seller',
      extensionConnected: true,
      extensionMode: true,
    });
    assert.equal(health?.tone, 'ok');
    assert.equal(health?.titleKey, 'dealHealth.autoSendTitle');
  });

  it('warns when Guard is pending', () => {
    const health = resolveDealHealth({
      order: baseOrder({
        tradeOperation: {
          id: 'op-1',
          status: 'WAITING',
          externalOfferId: '123',
        },
        tradeTask: {
          id: 'task-1',
          type: 'create_offer',
          status: 'IN_PROGRESS',
          executionPhase: 'OFFER_SENT',
          confirmPending: true,
          attemptCount: 1,
          maxAttempts: 5,
          expiresAt: '2026-08-26T13:00:00.000Z',
          createdAt: '2026-08-26T12:00:00.000Z',
          updatedAt: '2026-08-26T12:00:00.000Z',
        },
      }),
      role: 'seller',
    });
    assert.equal(health?.tone, 'warn');
    assert.equal(health?.supportCode, 'CONFIRM_PENDING');
  });

  it('warns on manual fallback after auto fail', () => {
    const health = resolveDealHealth({
      order: baseOrder({
        tradeTask: {
          id: 'task-1',
          type: 'create_offer',
          status: 'FAILED',
          executionPhase: 'OFFER_FAILED',
          lastErrorCode: 'OFFER_SEND_FAILED',
          attemptCount: 3,
          maxAttempts: 5,
          expiresAt: '2026-08-26T13:00:00.000Z',
          createdAt: '2026-08-26T12:00:00.000Z',
          updatedAt: '2026-08-26T12:00:00.000Z',
        },
      }),
      role: 'seller',
      extensionMode: true,
      extensionConnected: true,
    });
    assert.equal(health?.tone, 'warn');
    assert.equal(health?.titleKey, 'dealHealth.manualTitle');
  });

  it('errors when extension verification mismatch is synced', () => {
    const health = resolveDealHealth({
      order: baseOrder({
        tradeOperation: {
          id: 'op-1',
          status: 'WAITING',
          externalOfferId: '123',
        },
        tradeVerification: {
          status: 'mismatch',
          match: false,
          updatedAt: '2026-08-26T12:05:00.000Z',
          offerId: '123',
          failedChecks: [],
          nextAction: {
            kind: 'report_issue',
            title: 'Обмен не совпадает с заказом',
            description: 'Не принимайте',
          },
        },
      }),
      role: 'buyer',
    });
    assert.equal(health?.tone, 'error');
    assert.equal(health?.titleKey, 'dealHealth.mismatchTitle');
    assert.equal(health?.supportCode, 'ITEM_MISMATCH');
  });

  it('warns buyer to pair extension once offer is ready', () => {
    const health = resolveDealHealth({
      order: baseOrder({
        tradeOperation: {
          id: 'op-1',
          status: 'WAITING',
          externalOfferId: '8301234567',
        },
      }),
      role: 'buyer',
      extensionConnected: false,
      extensionMode: true,
    });
    assert.equal(health?.tone, 'warn');
    assert.equal(health?.titleKey, 'dealHealth.buyerPairTitle');
    assert.equal(health?.supportCode, 'EXT_BUYER_PAIR');
  });

  it('shows role-specific delivery verifying health after accept', () => {
    const buyer = resolveDealHealth({
      order: baseOrder({
        status: 'TRADE_CONFIRMED',
        tradeOperation: {
          id: 'op-1',
          status: 'CONFIRMED',
          externalOfferId: '123',
        },
      }),
      role: 'buyer',
    });
    assert.equal(buyer?.tone, 'info');
    assert.equal(buyer?.titleKey, 'dealHealth.tradeConfirmedBuyerTitle');

    const sellerHold = resolveDealHealth({
      order: baseOrder({
        status: 'SETTLEMENT_HOLD',
        settlementHoldUntil: '2026-09-03T12:00:00.000Z',
      }),
      role: 'seller',
    });
    assert.equal(sellerHold?.titleKey, 'dealHealth.settlementSellerTitle');
  });
});
