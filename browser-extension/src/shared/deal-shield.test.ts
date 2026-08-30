import { describe, expect, it } from 'vitest';
import {
  applyPartnerObservation,
  buildDealShieldModel,
  buildItemCharacteristicLines,
  resolvePartnerMatch,
} from './deal-shield.js';
import type { TradeVerificationResult } from '@rip-market/extension-orchestrator';

function baseTrade(
  overrides: Partial<TradeVerificationResult> = {},
): TradeVerificationResult {
  return {
    orderId: 'order-abcdefgh',
    orderShortId: 'order-ab',
    role: 'buyer',
    orderStatus: 'WAITING_TRADE',
    offerId: '111',
    verificationStatus: 'verified',
    checks: [],
    item: {
      marketHashName: 'AK-47 | Redline (Field-Tested)',
      floatValue: '0.25',
      wear: 'Field-Tested',
      iconUrl: 'https://example.com/i.png',
      assetExternalId: 'asset-1',
      stickers: [{ name: 'Katowice', wearPercent: 10 }],
    },
    counterparty: {
      userId: 'seller-1',
      username: 'seller',
      steamId: '76561198000000000',
      personaName: 'SellerNick',
      avatarUrl: 'https://example.com/a.jpg',
    },
    escrow: { holdAmountMinor: '1000', status: 'active' },
    acknowledgments: {
      sellerAckSent: true,
      buyerPreAccept: false,
      buyerReceived: false,
    },
    nextAction: {
      title: 'Accept',
      description: 'Accept in Steam',
      kind: 'accept_in_steam',
    },
    siteUrl: 'https://p2pcs.ru/orders/order-abcdefgh',
    amountMinor: '10000',
    ...overrides,
  };
}

describe('deal-shield', () => {
  it('resolves partner match states', () => {
    expect(
      resolvePartnerMatch({
        expectedSteamId: '76561198000000000',
        observedSteamId: '76561198000000000',
      }),
    ).toBe('match');
    expect(
      resolvePartnerMatch({
        expectedSteamId: '76561198000000000',
        observedSteamId: '76561198000000001',
      }),
    ).toBe('mismatch');
    expect(
      resolvePartnerMatch({
        expectedSteamId: '76561198000000000',
        observedSteamId: null,
      }),
    ).toBe('missing_observed');
  });

  it('elevates to mismatch when partner SteamID disagrees', () => {
    const next = applyPartnerObservation(
      baseTrade(),
      '76561198000000001',
      'ru',
    );
    expect(next.verificationStatus).toBe('mismatch');
    expect(
      next.checks.some(
        (c) => c.key === 'partner_steam_match' && c.passed === false,
      ),
    ).toBe(true);
  });

  it('downgrades verified to partial when partner cannot be read', () => {
    const next = applyPartnerObservation(baseTrade(), null, 'ru');
    expect(next.verificationStatus).toBe('partial');
  });

  it('hides empty item characteristics', () => {
    expect(
      buildItemCharacteristicLines({
        marketHashName: 'X',
        floatValue: null,
        wear: null,
        iconUrl: null,
        assetExternalId: '1',
        stickers: [],
      }),
    ).toEqual([]);
    expect(
      buildItemCharacteristicLines(
        {
          marketHashName: 'X',
          floatValue: '0.1',
          wear: 'MW',
          iconUrl: null,
          assetExternalId: '1',
          stickers: [{ name: 'S', wearPercent: null }],
        },
        'en',
      ).map((l) => l.key),
    ).toEqual(['wear', 'float', 'stickers']);
  });

  it('builds shield model with avatar and seller label for buyer', () => {
    const model = buildDealShieldModel({
      trade: baseTrade(),
      observed: { partnerSteamId: '76561198000000000', assetId: 'asset-1' },
      locale: 'ru',
    });
    expect(model.counterpartyRoleLabel).toBe('Продавец');
    expect(model.partner.avatarUrl).toContain('a.jpg');
    expect(model.partner.match).toBe('match');
    expect(model.blocksAccept).toBe(false);
    expect(model.item.lines.some((l) => l.key === 'wear')).toBe(true);
    expect(model.compareRows.some((r) => r.key === 'partner')).toBe(true);
  });

  it('marks pre-send for seller without offerId', () => {
    const model = buildDealShieldModel({
      trade: baseTrade({
        role: 'seller',
        offerId: null,
        verificationStatus: 'pending',
      }),
      locale: 'en',
    });
    expect(model.isPreSend).toBe(true);
    expect(model.counterpartyRoleLabel).toBe('Buyer');
  });
});
