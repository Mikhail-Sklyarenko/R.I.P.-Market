import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildSteamTradeOfferUrl,
  resolveBuyerAcceptWizard,
} from './buyer-accept-wizard.ts';
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
    tradeAcknowledgments: {
      sellerAckSent: false,
      buyerPreAccept: false,
      buyerReceived: false,
    },
    ...overrides,
  } as Order;
}

describe('buyer-accept-wizard', () => {
  it('builds deep link to the specific offer', () => {
    assert.equal(
      buildSteamTradeOfferUrl('8301234567'),
      'https://steamcommunity.com/tradeoffer/8301234567/',
    );
  });

  it('starts on open_offer before local open', () => {
    const view = resolveBuyerAcceptWizard({
      order: baseOrder(),
      role: 'buyer',
      extensionConnected: true,
      offerOpenedLocally: false,
    });
    assert.equal(view?.steps[0]?.state, 'current');
    assert.equal(view?.steps[1]?.state, 'upcoming');
    assert.equal(view?.primary.kind, 'open_offer');
    assert.equal(
      view?.primary.href,
      'https://steamcommunity.com/tradeoffer/8301234567/',
    );
  });

  it('advances to verify after offer opened', () => {
    const view = resolveBuyerAcceptWizard({
      order: baseOrder(),
      role: 'buyer',
      extensionConnected: true,
      offerOpenedLocally: true,
    });
    assert.equal(view?.steps[0]?.state, 'done');
    assert.equal(view?.steps[1]?.state, 'current');
    assert.equal(view?.primary.labelKey, 'buyerAcceptWizard.ctaReopenOffer');
  });

  it('advances to accept after pre-accept / verified', () => {
    const view = resolveBuyerAcceptWizard({
      order: baseOrder({
        tradeAcknowledgments: {
          sellerAckSent: true,
          buyerPreAccept: true,
          buyerReceived: false,
        },
      }),
      role: 'buyer',
      extensionConnected: true,
      offerOpenedLocally: true,
      ackEnabled: true,
    });
    assert.equal(view?.steps[1]?.state, 'done');
    assert.equal(view?.steps[2]?.state, 'current');
    assert.equal(view?.primary.labelKey, 'buyerAcceptWizard.ctaAcceptInSteam');
    assert.equal(view?.ack.showPreAccept, false);
    assert.equal(view?.ack.showReceived, true);
  });

  it('surfaces pre-accept ack as part of the scenario', () => {
    const view = resolveBuyerAcceptWizard({
      order: baseOrder(),
      role: 'buyer',
      offerOpenedLocally: true,
      ackEnabled: true,
    });
    assert.equal(view?.ack.showPreAccept, true);
    assert.equal(view?.ack.showReceived, false);
  });

  it('hides acks on mismatch', () => {
    const view = resolveBuyerAcceptWizard({
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
      offerOpenedLocally: true,
      ackEnabled: true,
    });
    assert.equal(view?.blockedByMismatch, true);
    assert.equal(view?.ack.showPreAccept, false);
    assert.equal(view?.ack.showReceived, false);
  });

  it('hides for sellers and before offer', () => {
    assert.equal(
      resolveBuyerAcceptWizard({
        order: baseOrder(),
        role: 'seller',
      }),
      null,
    );
    assert.equal(
      resolveBuyerAcceptWizard({
        order: baseOrder({
          tradeOperation: {
            id: 'op-1',
            status: 'WAITING',
            externalOfferId: null,
          },
        }),
        role: 'buyer',
      }),
      null,
    );
  });
});
