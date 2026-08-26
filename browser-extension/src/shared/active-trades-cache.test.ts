import { describe, expect, it } from 'vitest';
import {
  countActionableTrades,
  isActiveTradesCacheFresh,
} from './active-trades-cache.js';
import type { TradeVerificationResult } from '@rip-market/extension-orchestrator';

function trade(partial: Partial<TradeVerificationResult>): TradeVerificationResult {
  return {
    orderId: 'order-1',
    orderShortId: 'order-1',
    role: 'buyer',
    orderStatus: 'WAITING_TRADE',
    offerId: '123',
    verificationStatus: 'verified',
    checks: [],
    item: {
      marketHashName: 'AK-47',
      floatValue: null,
      wear: null,
      iconUrl: null,
      assetExternalId: '1',
    },
    counterparty: {
      userId: 'seller',
      username: 'seller',
      steamId: null,
      personaName: null,
      avatarUrl: null,
    },
    escrow: { holdAmountMinor: '1000', status: 'active' },
    acknowledgments: {
      sellerAckSent: false,
      buyerPreAccept: false,
      buyerReceived: false,
    },
    nextAction: {
      title: 'Примите обмен в Steam',
      description: '...',
      kind: 'accept_in_steam',
    },
    siteUrl: 'http://localhost/orders/order-1',
    amountMinor: '1000',
    ...partial,
  };
}

describe('active-trades-cache', () => {
  it('counts actionable next steps', () => {
    expect(
      countActionableTrades([
        trade({ nextAction: { kind: 'wait', title: 'x', description: 'y' } }),
        trade({
          nextAction: { kind: 'accept_in_steam', title: 'x', description: 'y' },
        }),
      ]),
    ).toBe(1);
  });

  it('detects fresh vs stale cache by TTL', () => {
    const now = Date.parse('2026-08-27T12:00:00.000Z');
    expect(
      isActiveTradesCacheFresh(
        { updatedAt: new Date(now - 5_000).toISOString(), trades: [] },
        now,
        20_000,
      ),
    ).toBe(true);
    expect(
      isActiveTradesCacheFresh(
        { updatedAt: new Date(now - 30_000).toISOString(), trades: [] },
        now,
        20_000,
      ),
    ).toBe(false);
    expect(isActiveTradesCacheFresh(null, now)).toBe(false);
  });
});
