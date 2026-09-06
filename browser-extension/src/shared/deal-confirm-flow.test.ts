import { describe, expect, it } from 'vitest';
import type { TradeVerificationResult } from '@rip-market/extension-orchestrator';
import {
  isDeliveryDualSignalOk,
  needsBuyerReceivedConfirm,
  resolveDealConfirmPhase,
} from './deal-confirm-flow.js';

function trade(
  overrides: Partial<TradeVerificationResult> &
    Pick<TradeVerificationResult, 'orderId' | 'role'>,
): TradeVerificationResult {
  return {
    orderShortId: 'abcd1234',
    orderStatus: 'WAITING_TRADE',
    offerId: '55',
    verificationStatus: 'verified',
    checks: [],
    item: {
      marketHashName: 'AWP',
      floatValue: null,
      wear: null,
      iconUrl: null,
      assetExternalId: '1',
    },
    counterparty: {
      userId: 'u2',
      username: 'other',
      steamId: '76561198000000001',
      personaName: null,
      avatarUrl: null,
    },
    escrow: { holdAmountMinor: '500', status: 'active' },
    acknowledgments: {
      sellerAckSent: true,
      buyerPreAccept: true,
      buyerReceived: false,
    },
    nextAction: {
      kind: 'accept_in_steam',
      title: 'Accept',
      description: 'steam',
    },
    siteUrl: 'https://p2pcs.ru/orders/abc',
    amountMinor: '500',
    deliveryProgress: null,
    ...overrides,
  };
}

describe('deal-confirm-flow', () => {
  it('detects dual-signal ok', () => {
    expect(
      isDeliveryDualSignalOk({
        offerTone: 'ok',
        inventoryTone: 'ok',
        offerStatus: 'accepted',
        inventoryHint: 'confirmed',
        outcome: 'CONFIRMED',
        checkedAt: '2026-09-06T00:00:00.000Z',
      }),
    ).toBe(true);
    expect(
      isDeliveryDualSignalOk({
        offerTone: 'ok',
        inventoryTone: 'pending',
        offerStatus: 'accepted',
        inventoryHint: 'pending',
        outcome: null,
        checkedAt: null,
      }),
    ).toBe(false);
  });

  it('asks for received confirm after TRADE_CONFIRMED when signals lag', () => {
    expect(
      needsBuyerReceivedConfirm(
        trade({
          orderId: '1',
          role: 'buyer',
          orderStatus: 'TRADE_CONFIRMED',
          nextAction: {
            kind: 'platform_verifying',
            title: 'v',
            description: 'd',
          },
        }),
      ),
    ).toBe(true);
  });

  it('skips received confirm when dual-signal already ok', () => {
    expect(
      needsBuyerReceivedConfirm(
        trade({
          orderId: '2',
          role: 'buyer',
          orderStatus: 'TRADE_CONFIRMED',
          nextAction: {
            kind: 'platform_verifying',
            title: 'v',
            description: 'd',
          },
          deliveryProgress: {
            offerTone: 'ok',
            inventoryTone: 'ok',
            offerStatus: 'accepted',
            inventoryHint: 'confirmed',
            outcome: 'CONFIRMED',
            checkedAt: '2026-09-06T00:00:00.000Z',
          },
        }),
      ),
    ).toBe(false);
  });

  it('skips received confirm on SETTLEMENT_HOLD', () => {
    expect(
      needsBuyerReceivedConfirm(
        trade({
          orderId: '3',
          role: 'buyer',
          orderStatus: 'SETTLEMENT_HOLD',
          nextAction: {
            kind: 'platform_verifying',
            title: 'hold',
            description: 'd',
          },
        }),
      ),
    ).toBe(false);
    expect(
      resolveDealConfirmPhase(
        trade({
          orderId: '3',
          role: 'buyer',
          orderStatus: 'SETTLEMENT_HOLD',
          nextAction: {
            kind: 'platform_verifying',
            title: 'hold',
            description: 'd',
          },
        }),
      ),
    ).toBe('done');
  });

  it('shows received after accept assist while still waiting', () => {
    expect(
      needsBuyerReceivedConfirm(
        trade({
          orderId: '4',
          role: 'buyer',
          orderStatus: 'WAITING_TRADE',
        }),
        { acceptAssistDone: true },
      ),
    ).toBe(true);
  });
});
