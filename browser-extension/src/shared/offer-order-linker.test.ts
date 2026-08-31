import { describe, expect, it } from 'vitest';
import type { TradeVerificationResult } from '@rip-market/extension-orchestrator';
import { findOfferLinkTarget } from './offer-order-linker.js';

function sellerTrade(
  partial: Partial<TradeVerificationResult> & { orderId: string },
): TradeVerificationResult {
  return {
    orderId: partial.orderId,
    orderShortId: partial.orderShortId ?? partial.orderId.slice(0, 8),
    role: 'seller',
    orderStatus: partial.orderStatus ?? 'WAITING_TRADE',
    offerId: partial.offerId ?? null,
    verificationStatus: partial.verificationStatus ?? 'partial',
    checks: partial.checks ?? [],
    item: partial.item ?? {
      marketHashName: 'AK-47 | Redline (Field-Tested)',
      floatValue: null,
      wear: 'FT',
      iconUrl: null,
      assetExternalId: 'asset-1',
      stickers: null,
    },
    counterparty: partial.counterparty ?? {
      steamId: '76561198000000001',
      displayName: 'Buyer',
      avatarUrl: null,
      profileUrl: null,
    },
    escrow: partial.escrow ?? { active: true, holdAmountMinor: '100' },
    acknowledgments: partial.acknowledgments ?? {
      sellerAckSent: false,
      buyerPreAccept: false,
      buyerReceived: false,
    },
    nextAction: partial.nextAction ?? {
      kind: 'wait',
      title: 'Wait',
      description: 'Wait',
    },
    siteUrl: partial.siteUrl ?? `https://p2pcs.ru/orders/${partial.orderId}`,
    amountMinor: partial.amountMinor ?? '100',
    commissionMinor: partial.commissionMinor ?? '5',
    sellerReceiveMinor: partial.sellerReceiveMinor ?? '95',
    createdAt: partial.createdAt ?? '2026-08-31T00:00:00.000Z',
    tradeTimeoutAt: partial.tradeTimeoutAt ?? '2026-08-31T01:00:00.000Z',
    buyerTradeUrl:
      partial.buyerTradeUrl ??
      'https://steamcommunity.com/tradeoffer/new/?partner=1&token=abc',
    settlementHoldUntil: partial.settlementHoldUntil ?? null,
    deliveryProgress: partial.deliveryProgress ?? null,
  };
}

describe('findOfferLinkTarget', () => {
  it('returns null when no unlinked seller trades', () => {
    expect(
      findOfferLinkTarget(
        [
          sellerTrade({
            orderId: 'order-1',
            offerId: '9336569013',
          }),
        ],
        { offerId: '9336569013' },
      ),
    ).toBeNull();
  });

  it('matches by asset id when multiple open seller deals', () => {
    const trades = [
      sellerTrade({
        orderId: 'order-a',
        item: {
          marketHashName: 'A',
          floatValue: null,
          wear: null,
          iconUrl: null,
          assetExternalId: '730_2_111',
          stickers: null,
        },
      }),
      sellerTrade({
        orderId: 'order-b',
        item: {
          marketHashName: 'B',
          floatValue: null,
          wear: null,
          iconUrl: null,
          assetExternalId: '730_2_222',
          stickers: null,
        },
      }),
    ];
    const target = findOfferLinkTarget(trades, {
      offerId: '9336569013',
      assetId: '730_2_222',
    });
    expect(target?.orderId).toBe('order-b');
  });
});
