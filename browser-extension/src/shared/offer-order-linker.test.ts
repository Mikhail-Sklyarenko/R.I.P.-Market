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
  it('returns already-linked trade when offer id matches (idempotent)', () => {
    const linked = sellerTrade({
      orderId: 'order-1',
      offerId: '9336569013',
    });
    expect(
      findOfferLinkTarget([linked], { offerId: '9336569013' })?.orderId,
    ).toBe('order-1');
  });

  it('returns null when linked offer id differs (never re-link)', () => {
    expect(
      findOfferLinkTarget(
        [
          sellerTrade({
            orderId: 'order-1',
            offerId: '1111111111',
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

  it('refuses single open deal when intercepted asset does not match lot', () => {
    expect(
      findOfferLinkTarget(
        [
          sellerTrade({
            orderId: 'order-mp7',
            item: {
              marketHashName: 'MP7',
              floatValue: null,
              wear: 'BS',
              iconUrl: null,
              assetExternalId: '52925932783',
              stickers: null,
            },
          }),
        ],
        {
          offerId: '9348893119',
          assetId: '50620569346',
        },
      ),
    ).toBeNull();
  });

  it('links single open deal when asset matches', () => {
    expect(
      findOfferLinkTarget(
        [
          sellerTrade({
            orderId: 'order-mp7',
            item: {
              marketHashName: 'MP7',
              floatValue: null,
              wear: 'BS',
              iconUrl: null,
              assetExternalId: '52925932783',
              stickers: null,
            },
          }),
        ],
        {
          offerId: '9350000001',
          assetId: '52925932783',
        },
      )?.orderId,
    ).toBe('order-mp7');
  });

  it('does not guess among multiple deals without unique asset/url', () => {
    expect(
      findOfferLinkTarget(
        [
          sellerTrade({ orderId: 'order-a' }),
          sellerTrade({
            orderId: 'order-b',
            item: {
              marketHashName: 'B',
              floatValue: null,
              wear: null,
              iconUrl: null,
              assetExternalId: 'asset-b',
              stickers: null,
            },
          }),
        ],
        { offerId: '9336569013' },
      ),
    ).toBeNull();
  });
});
