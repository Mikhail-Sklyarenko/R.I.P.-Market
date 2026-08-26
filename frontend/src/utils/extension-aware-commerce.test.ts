import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  resolveBuyerAcceptExtensionCopyKind,
  resolveExtensionAwareHint,
  resolveSellerAutoSendExtensionCopyKind,
} from './extension-aware-commerce.ts';
import { getDealFlowSteps, getOrderNextAction } from './order-flow.ts';
import type { Order } from '../api/types.ts';

function baseOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    status: 'WAITING_TRADE',
    buyerId: 'buyer-1',
    sellerId: 'seller-1',
    amountMinor: '1000',
    currency: 'USD',
    createdAt: '2026-08-26T12:00:00.000Z',
    updatedAt: '2026-08-26T12:00:00.000Z',
    lot: {
      id: 'lot-1',
      priceMinor: '1000',
      currency: 'USD',
      status: 'RESERVED',
      inventoryAsset: {
        id: 'asset-1',
        assetExternalId: 'steam-1',
        floatValue: null,
        wear: null,
        paintSeed: null,
        stickers: null,
        itemDefinition: {
          marketHashName: 'AK-47 | Redline (Field-Tested)',
          iconUrl: null,
          name: 'AK-47 | Redline',
          type: 'Rifle',
          rarity: null,
          weapon: 'AK-47',
        },
      },
    },
    tradeOperation: {
      id: 'op-1',
      status: 'WAITING',
      externalOfferId: '1234567890',
      expectedAssetId: 'steam-1',
    },
    hold: null,
    buyer: null,
    seller: null,
    statusEvents: [],
    tradeTask: {
      id: 'task-1',
      type: 'create_offer',
      status: 'IN_PROGRESS',
      executionPhase: 'SENDING',
      lastErrorCode: null,
      lastErrorMessage: null,
      selectedMarketHashName: null,
      confirmPending: false,
      confirmPendingSince: null,
      expiresAt: '2026-08-26T13:00:00.000Z',
      attemptCount: 1,
      maxAttempts: 5,
    },
    ...overrides,
  } as Order;
}

describe('extension-aware-commerce (I1)', () => {
  it('hides hint when channel is off', () => {
    const hint = resolveExtensionAwareHint({
      channelEnabled: false,
      runtimeAvailable: true,
      connected: false,
      surface: 'buy',
    });
    assert.equal(hint.kind, 'hidden');
  });

  it('resolves buy/sell connected, pair, and install kinds', () => {
    assert.equal(
      resolveExtensionAwareHint({
        channelEnabled: true,
        runtimeAvailable: true,
        connected: true,
        surface: 'buy',
      }).kind,
      'connected',
    );
    assert.equal(
      resolveExtensionAwareHint({
        channelEnabled: true,
        runtimeAvailable: true,
        connected: false,
        surface: 'sell',
      }).kind,
      'pair',
    );
    assert.equal(
      resolveExtensionAwareHint({
        channelEnabled: true,
        runtimeAvailable: false,
        connected: false,
        surface: 'buy',
      }).kind,
      'install',
    );
  });

  it('maps next-action copy kinds from extension session', () => {
    assert.equal(
      resolveBuyerAcceptExtensionCopyKind({
        extensionTradeAckEnabled: true,
        extensionConnected: true,
      }),
      'shield',
    );
    assert.equal(
      resolveBuyerAcceptExtensionCopyKind({
        extensionTradeAckEnabled: true,
        extensionConnected: false,
      }),
      'pair',
    );
    assert.equal(
      resolveSellerAutoSendExtensionCopyKind({
        extensionTaskPipeline: true,
        extensionConnected: false,
      }),
      'offline',
    );
  });

  it('adapts buyer next-action for shield vs pair', () => {
    const shield = getOrderNextAction(baseOrder(), 'buyer', 'en', {
      extensionTradeAckEnabled: true,
      extensionConnected: true,
    });
    assert.match(shield?.title ?? '', /shield|verified/i);
    assert.equal(shield?.kind, 'accept_in_steam');

    const pair = getOrderNextAction(baseOrder(), 'buyer', 'en', {
      extensionTradeAckEnabled: true,
      extensionConnected: false,
    });
    assert.match(pair?.title ?? '', /Connect|extension/i);
    assert.equal(pair?.kind, 'pair_extension');
  });

  it('prompts seller to connect when pipeline on and offline', () => {
    const action = getOrderNextAction(
      baseOrder({
        tradeOperation: {
          id: 'op-1',
          status: 'WAITING',
          externalOfferId: null,
        },
      }),
      'seller',
      'en',
      {
        extensionTaskPipeline: true,
        extensionConnected: false,
      },
    );
    assert.match(action?.title ?? '', /Connect|extension/i);
    assert.equal(action?.kind, 'pair_extension');
  });

  it('uses extension-aware deal-flow copy for trade and accept', () => {
    const steps = getDealFlowSteps('en', { extensionAware: true });
    const trade = steps.find((step) => step.key === 'trade-offer');
    const accept = steps.find((step) => step.key === 'accept');
    const reserve = steps.find((step) => step.key === 'reserve');
    assert.match(trade?.title ?? '', /Auto-send|extension/i);
    assert.match(accept?.title ?? '', /shield|Safe accept/i);
    assert.match(reserve?.title ?? '', /Funds reserved/i);
  });
});
