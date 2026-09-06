import { describe, expect, it } from 'vitest';
import type { TradeVerificationResult } from '@rip-market/extension-orchestrator';
import { resolveTradeForOfferPage } from './resolve-trade-for-offer-page.js';

function trade(
  partial: Partial<TradeVerificationResult> &
    Pick<TradeVerificationResult, 'orderId' | 'role'>,
): TradeVerificationResult {
  return {
    orderShortId: partial.orderId.slice(0, 8),
    orderStatus: 'WAITING_TRADE',
    offerId: null,
    verificationStatus: 'pending',
    checks: [],
    item: {
      marketHashName: 'AK',
      floatValue: null,
      wear: null,
      iconUrl: null,
      assetExternalId: 'asset-1',
    },
    counterparty: {
      userId: 'u',
      username: 'u',
      steamId: '76561198000000001',
      personaName: null,
      avatarUrl: null,
    },
    escrow: { holdAmountMinor: '100', status: 'active' },
    acknowledgments: {
      sellerAckSent: false,
      buyerPreAccept: false,
      buyerReceived: false,
    },
    nextAction: {
      kind: 'accept_in_steam',
      title: 'Accept',
      description: 'Accept',
    },
    siteUrl: 'https://p2pcs.ru/orders/x',
    amountMinor: '100',
    ...partial,
  };
}

describe('resolveTradeForOfferPage', () => {
  it('matches by offer id first', () => {
    const matched = resolveTradeForOfferPage({
      offerId: '111',
      trades: [
        trade({ orderId: 'a', role: 'buyer', offerId: '111' }),
        trade({ orderId: 'b', role: 'buyer', offerId: '222' }),
      ],
    });
    expect(matched?.orderId).toBe('a');
  });

  it('falls back to single waiting buyer trade when offer not linked yet', () => {
    const matched = resolveTradeForOfferPage({
      offerId: '999',
      roleHint: 'buyer',
      trades: [trade({ orderId: 'solo', role: 'buyer', offerId: null })],
    });
    expect(matched?.orderId).toBe('solo');
  });

  it('falls back by observed asset id', () => {
    const matched = resolveTradeForOfferPage({
      offerId: '999',
      observedAssetId: 'asset-42',
      roleHint: 'buyer',
      trades: [
        trade({
          orderId: 'keep',
          role: 'buyer',
          offerId: null,
          item: {
            marketHashName: 'UMP',
            floatValue: null,
            wear: 'BS',
            iconUrl: null,
            assetExternalId: 'asset-42',
          },
        }),
        trade({ orderId: 'other', role: 'buyer', offerId: null }),
      ],
    });
    expect(matched?.orderId).toBe('keep');
  });

  it('does not attach when the only waiting trade is linked to a different offer', () => {
    const matched = resolveTradeForOfferPage({
      offerId: '999',
      roleHint: 'buyer',
      trades: [trade({ orderId: 'solo', role: 'buyer', offerId: '111' })],
    });
    expect(matched).toBeNull();
  });

  it('does not attach single waiting trade when observed asset mismatches lot', () => {
    const matched = resolveTradeForOfferPage({
      offerId: '999',
      observedAssetId: '50620569346',
      roleHint: 'buyer',
      trades: [
        trade({
          orderId: 'solo',
          role: 'buyer',
          offerId: null,
          item: {
            marketHashName: 'MP7',
            floatValue: null,
            wear: 'BS',
            iconUrl: null,
            assetExternalId: '52925932783',
          },
        }),
      ],
    });
    expect(matched).toBeNull();
  });
});
