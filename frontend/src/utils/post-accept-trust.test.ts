import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatSettlementHoldUntil,
  resolvePostAcceptTrust,
} from './post-accept-trust.ts';
import type { Order } from '../api/types.ts';

function baseOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    lotId: 'lot-1',
    buyerId: 'buyer-1',
    sellerId: 'seller-1',
    status: 'TRADE_CONFIRMED',
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
      status: 'CONFIRMED',
      externalOfferId: '123',
    },
    ...overrides,
  } as Order;
}

describe('post-accept-trust', () => {
  it('builds dual-signal delivery view for TRADE_CONFIRMED', () => {
    const view = resolvePostAcceptTrust({
      order: baseOrder({
        deliveryProbe: {
          checkedAt: '2026-08-26T12:10:00.000Z',
          offerStatus: 'Accepted',
          outcome: 'CONFIRM',
          inventoryHint: 'confirmed',
        },
      }),
      role: 'buyer',
    });
    assert.equal(view?.phase, 'delivery_verifying');
    assert.equal(view?.dualSignals?.length, 2);
    assert.equal(view?.dualSignals?.[0]?.tone, 'ok');
    assert.equal(view?.dualSignals?.[1]?.tone, 'ok');
    assert.equal(view?.titleKey, 'postAcceptTrust.deliveryBuyerTitle');
  });

  it('builds settlement hold view with seller protection reason', () => {
    const view = resolvePostAcceptTrust({
      order: baseOrder({
        status: 'SETTLEMENT_HOLD',
        settlementHoldUntil: '2026-09-03T12:00:00.000Z',
      }),
      role: 'seller',
    });
    assert.equal(view?.phase, 'settlement_hold');
    assert.equal(view?.reasonKey, 'postAcceptTrust.holdSellerReason');
    assert.equal(view?.holdUntil, '2026-09-03T12:00:00.000Z');
    assert.equal(view?.dualSignals, null);
  });

  it('formats hold until for locale', () => {
    const formatted = formatSettlementHoldUntil(
      '2026-09-03T12:00:00.000Z',
      'ru',
    );
    assert.ok(formatted);
    assert.match(formatted!, /2026/);
  });
});
