import { describe, expect, it } from 'vitest';
import type { TradeVerificationResult } from '@rip-market/extension-orchestrator';
import {
  classifyOfferMark,
  isRipOfferMark,
  parseTradeOfferIdFromElementId,
} from './trade-offers-list-marking.js';

function trade(
  overrides: Partial<TradeVerificationResult> & { offerId: string },
): TradeVerificationResult {
  return {
    orderId: 'order-1',
    orderShortId: 'order-1'.slice(0, 8),
    role: 'buyer',
    orderStatus: 'WAITING_TRADE',
    verificationStatus: 'verified',
    checks: [],
    item: {
      marketHashName: 'AK-47 | Redline (Field-Tested)',
      floatValue: null,
      wear: 'FT',
      iconUrl: null,
      assetExternalId: 'asset-1',
    },
    counterparty: {
      userId: 'seller-1',
      username: 'seller',
      steamId: '76561198000000002',
      personaName: 'Seller',
      avatarUrl: null,
    },
    escrow: { holdAmountMinor: '1000', status: 'active' },
    acknowledgments: {
      sellerAckSent: false,
      buyerPreAccept: false,
      buyerReceived: false,
    },
    nextAction: {
      kind: 'accept_in_steam',
      title: 'Примите обмен',
      description: 'Откройте входящие',
    },
    siteUrl: 'https://p2pcs.ru/orders/order-1',
    amountMinor: '1000',
    ...overrides,
  };
}

describe('trade-offers-list-marking', () => {
  it('parses tradeofferid_ element ids', () => {
    expect(parseTradeOfferIdFromElementId('tradeofferid_1234567890')).toBe(
      '1234567890',
    );
    expect(parseTradeOfferIdFromElementId('other')).toBeNull();
  });

  it('marks matched verified offer as RIP deal', () => {
    const mark = classifyOfferMark('111', [
      trade({ offerId: '111', verificationStatus: 'verified' }),
    ]);
    expect(mark.kind).toBe('rip_verified');
    expect(mark.label).toBe('Сделка R.I.P');
    expect(isRipOfferMark(mark.kind)).toBe(true);
  });

  it('marks mismatch as suspicious', () => {
    const mark = classifyOfferMark('222', [
      trade({ offerId: '222', verificationStatus: 'mismatch' }),
    ]);
    expect(mark.kind).toBe('rip_mismatch');
    expect(mark.label).toBe('Подозрительно');
  });

  it('marks unknown offer as not ours', () => {
    const mark = classifyOfferMark('999', [
      trade({ offerId: '111', verificationStatus: 'verified' }),
    ]);
    expect(mark.kind).toBe('not_ours');
    expect(mark.label).toBe('Не наша сделка');
    expect(isRipOfferMark(mark.kind)).toBe(false);
  });
});
