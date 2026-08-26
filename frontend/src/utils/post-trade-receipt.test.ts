import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Order } from '../api/types.ts';
import {
  buildOrderPostTradeReceipt,
  canShowOrderPostTradeReceipt,
} from './post-trade-receipt.ts';

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: 'ord-42abcdef',
    lotId: 'lot-1',
    buyerId: 'b1',
    sellerId: 's1',
    status: 'COMPLETED',
    amountMinor: '10000',
    holdAmountMinor: '10000',
    createdAt: '2026-08-20T00:00:00.000Z',
    lot: {
      id: 'lot-1',
      status: 'SOLD',
      priceMinor: '10000',
      commissionMinor: '500',
      sellerReceiveMinor: '9500',
      createdAt: '2026-08-19T00:00:00.000Z',
      inventoryAsset: {
        id: 'a1',
        assetExternalId: '1',
        floatValue: null,
        wear: 'FT',
        tradable: true,
        marketable: true,
        capturedAt: '2026-08-19T00:00:00.000Z',
        itemDefinition: {
          id: 'd1',
          marketHashName: 'AK-47 | Redline (Field-Tested)',
          iconUrl: null,
          weapon: 'AK-47',
          rarity: null,
        },
      },
    },
    tradeOperation: {
      id: 't1',
      status: 'CONFIRMED',
      externalOfferId: '830999',
      updatedAt: '2026-08-20T01:00:00.000Z',
    },
    ...overrides,
  } as Order;
}

describe('post-trade-receipt', () => {
  it('only shows for COMPLETED', () => {
    assert.equal(canShowOrderPostTradeReceipt('COMPLETED'), true);
    assert.equal(canShowOrderPostTradeReceipt('WAITING_TRADE'), false);
  });

  it('builds buyer and seller receipts', () => {
    const buyer = buildOrderPostTradeReceipt({
      order: order(),
      role: 'buyer',
    });
    assert.ok(buyer);
    assert.equal(buyer!.verbKey, 'postTradeReceipt.bought');
    assert.equal(buyer!.netMinor, '10000');
    assert.equal(buyer!.commissionMinor, '500');
    assert.equal(buyer!.offerId, '830999');

    const seller = buildOrderPostTradeReceipt({
      order: order(),
      role: 'seller',
    });
    assert.ok(seller);
    assert.equal(seller!.verbKey, 'postTradeReceipt.sold');
    assert.equal(seller!.netMinor, '9500');
    assert.equal(seller!.netCaptionKey, 'postTradeReceipt.credited');
  });
});
