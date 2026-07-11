import { describe, expect, it } from 'vitest';
import { countActionableTrades } from './active-trades-cache.js';
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
  it('counts actionable trades', () => {
    expect(
      countActionableTrades([
        trade({ nextAction: { title: 'a', description: 'b', kind: 'accept_in_steam' } }),
        trade({ nextAction: { title: 'a', description: 'b', kind: 'completed' } }),
      ]),
    ).toBe(1);
  });
});
