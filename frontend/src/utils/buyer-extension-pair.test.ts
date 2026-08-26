import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveBuyerExtensionPairMoment } from './buyer-extension-pair.ts';
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
      externalOfferId: '8301234567',
    },
    ...overrides,
  } as Order;
}

describe('buyer-extension-pair', () => {
  it('prompts pair only for buyer with offer and ack enabled', () => {
    const moment = resolveBuyerExtensionPairMoment({
      order: baseOrder(),
      role: 'buyer',
      extensionTradeAckEnabled: true,
      extensionConnected: false,
    });
    assert.equal(moment.showPairPrompt, true);
    assert.equal(moment.showReadyHint, false);
    assert.equal(
      moment.steamOfferUrl,
      'https://steamcommunity.com/tradeoffer/8301234567/',
    );
  });

  it('does not prompt before offer is linked', () => {
    const moment = resolveBuyerExtensionPairMoment({
      order: baseOrder({
        tradeOperation: {
          id: 'op-1',
          status: 'WAITING',
          externalOfferId: null,
        },
      }),
      role: 'buyer',
      extensionTradeAckEnabled: true,
      extensionConnected: false,
    });
    assert.equal(moment.showPairPrompt, false);
  });

  it('shows ready hint when already connected', () => {
    const moment = resolveBuyerExtensionPairMoment({
      order: baseOrder(),
      role: 'buyer',
      extensionTradeAckEnabled: true,
      extensionConnected: true,
    });
    assert.equal(moment.showPairPrompt, false);
    assert.equal(moment.showReadyHint, true);
  });

  it('hides pair and ready on mismatch', () => {
    const moment = resolveBuyerExtensionPairMoment({
      order: baseOrder({
        tradeVerification: {
          status: 'mismatch',
          match: false,
          updatedAt: '2026-08-26T12:00:00.000Z',
          offerId: '8301234567',
          failedChecks: [],
          nextAction: null,
        },
      }),
      role: 'buyer',
      extensionTradeAckEnabled: true,
      extensionConnected: true,
    });
    assert.equal(moment.showPairPrompt, false);
    assert.equal(moment.showReadyHint, false);
  });

  it('ignores sellers and disabled ack', () => {
    assert.equal(
      resolveBuyerExtensionPairMoment({
        order: baseOrder(),
        role: 'seller',
        extensionTradeAckEnabled: true,
        extensionConnected: false,
      }).showPairPrompt,
      false,
    );
    assert.equal(
      resolveBuyerExtensionPairMoment({
        order: baseOrder(),
        role: 'buyer',
        extensionTradeAckEnabled: false,
        extensionConnected: false,
      }).showPairPrompt,
      false,
    );
  });
});
