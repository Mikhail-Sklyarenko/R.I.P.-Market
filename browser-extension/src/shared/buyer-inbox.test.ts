import { describe, expect, it } from 'vitest';
import type { TradeVerificationResult } from '@rip-market/extension-orchestrator';
import {
  buildBuyerInbox,
  buildBuyerInboxCard,
  buildSteamTradeOfferUrl,
  partitionActiveTrades,
  resolveBuyerInboxPhase,
  sortBuyerInboxCards,
} from './buyer-inbox.js';

function baseTrade(
  overrides: Partial<TradeVerificationResult> = {},
): TradeVerificationResult {
  return {
    orderId: 'ord-1',
    orderShortId: 'A1B2',
    role: 'buyer',
    orderStatus: 'WAITING_TRADE',
    offerId: '8301234567',
    verificationStatus: 'pending',
    checks: [],
    item: {
      marketHashName: 'AK-47 | Redline (FT)',
      floatValue: '0.25',
      wear: 'FT',
      iconUrl: null,
      assetExternalId: 'asset-1',
    },
    counterparty: {
      userId: 'seller-1',
      username: 'seller',
      steamId: '76561198000000000',
      personaName: null,
      avatarUrl: null,
    },
    escrow: { holdAmountMinor: '1000', status: 'active' },
    acknowledgments: {
      sellerAckSent: true,
      buyerPreAccept: false,
      buyerReceived: false,
    },
    nextAction: {
      kind: 'accept_in_steam',
      title: 'Примите обмен в Steam',
      description: 'Откройте этот offer…',
    },
    siteUrl: 'https://p2pcs.ru/orders/ord-1',
    amountMinor: '12500',
    ...overrides,
  };
}

describe('buildSteamTradeOfferUrl', () => {
  it('builds deep link for offer id', () => {
    expect(buildSteamTradeOfferUrl('8301234567')).toBe(
      'https://steamcommunity.com/tradeoffer/8301234567/',
    );
  });

  it('returns null for empty', () => {
    expect(buildSteamTradeOfferUrl(null)).toBeNull();
    expect(buildSteamTradeOfferUrl('  ')).toBeNull();
  });
});

describe('resolveBuyerInboxPhase', () => {
  it('maps wait / accept / verifying / dispute', () => {
    expect(
      resolveBuyerInboxPhase(
        baseTrade({
          offerId: null,
          nextAction: {
            kind: 'wait',
            title: 'Ждём',
            description: '…',
          },
        }),
      ),
    ).toBe('wait_offer');

    expect(resolveBuyerInboxPhase(baseTrade())).toBe('accept');

    expect(
      resolveBuyerInboxPhase(
        baseTrade({
          orderStatus: 'TRADE_CONFIRMED',
          nextAction: {
            kind: 'platform_verifying',
            title: 'Проверяем',
            description: '…',
          },
        }),
      ),
    ).toBe('verifying');

    const verifyingCard = buildBuyerInboxCard(
      baseTrade({
        orderStatus: 'TRADE_CONFIRMED',
        nextAction: {
          kind: 'platform_verifying',
          title: 'Проверяем',
          description: '…',
        },
        deliveryProgress: {
          offerTone: 'ok',
          inventoryTone: 'pending',
          offerStatus: 'Accepted',
          inventoryHint: 'pending',
          outcome: 'ok',
          checkedAt: '2026-08-27T00:00:00.000Z',
        },
      }),
    );
    expect(verifyingCard?.settlement?.phase).toBe('delivery_verifying');
    expect(verifyingCard?.settlement?.signals?.[0]?.tone).toBe('ok');

    expect(
      resolveBuyerInboxPhase(
        baseTrade({
          verificationStatus: 'mismatch',
          nextAction: {
            kind: 'report_issue',
            title: 'Mismatch',
            description: '…',
          },
        }),
      ),
    ).toBe('dispute');

    expect(
      resolveBuyerInboxPhase(
        baseTrade({
          orderStatus: 'DISPUTE',
          nextAction: {
            kind: 'report_issue',
            title: 'Спор',
            description: '…',
          },
        }),
      ),
    ).toBe('dispute');
  });
});

describe('buildBuyerInboxCard', () => {
  it('uses deep link as primary CTA on accept', () => {
    const card = buildBuyerInboxCard(baseTrade());
    expect(card?.phase).toBe('accept');
    expect(card?.primary.kind).toBe('open_verified_offer');
    expect(card?.primary.href).toBe(
      'https://steamcommunity.com/tradeoffer/8301234567/',
    );
    expect(card?.primary.label).toContain('проверенный оффер');
    expect(card?.showPreAccept).toBe(true);
  });

  it('hides sellers and completed purchases', () => {
    expect(
      buildBuyerInboxCard(baseTrade({ role: 'seller' })),
    ).toBeNull();
    expect(
      buildBuyerInboxCard(
        baseTrade({
          nextAction: {
            kind: 'completed',
            title: 'Готово',
            description: '…',
          },
        }),
      ),
    ).toBeNull();
  });

  it('surfaces dispute CTA with evidence support URL', () => {
    const card = buildBuyerInboxCard(
      baseTrade({
        verificationStatus: 'mismatch',
        nextAction: {
          kind: 'report_issue',
          title: 'Не совпадает',
          description: 'Не принимайте',
        },
      }),
    );
    expect(card?.phase).toBe('dispute');
    expect(card?.primary.kind).toBe('open_dispute');
    expect(card?.primary.href).toContain('/support?');
    expect(card?.primary.href).toContain('evidence=');
    expect(card?.showPreAccept).toBe(false);
    expect(card?.dispute?.phase).toBe('needs_dispute');
  });
});

describe('buildBuyerInbox / sort', () => {
  it('sorts dispute → accept → wait → verifying', () => {
    const sorted = sortBuyerInboxCards([
      buildBuyerInboxCard(
        baseTrade({
          orderId: 'v',
          orderShortId: 'VVVV',
          orderStatus: 'TRADE_CONFIRMED',
          nextAction: {
            kind: 'platform_verifying',
            title: 'v',
            description: '…',
          },
        }),
      )!,
      buildBuyerInboxCard(
        baseTrade({
          orderId: 'w',
          orderShortId: 'WWWW',
          offerId: null,
          nextAction: { kind: 'wait', title: 'w', description: '…' },
        }),
      )!,
      buildBuyerInboxCard(baseTrade({ orderId: 'a', orderShortId: 'AAAA' }))!,
      buildBuyerInboxCard(
        baseTrade({
          orderId: 'd',
          orderShortId: 'DDDD',
          verificationStatus: 'mismatch',
          nextAction: {
            kind: 'report_issue',
            title: 'd',
            description: '…',
          },
        }),
      )!,
    ]);

    expect(sorted.map((c) => c.phase)).toEqual([
      'dispute',
      'accept',
      'wait_offer',
      'verifying',
    ]);
  });

  it('surfaces timeout and problem support URL on cards', () => {
    const deadline = new Date(Date.now() + 12 * 60_000).toISOString();
    const card = buildBuyerInboxCard(
      baseTrade({
        tradeTimeoutAt: deadline,
        createdAt: new Date(Date.now() - 48 * 60_000).toISOString(),
      }),
    );
    expect(card?.timeoutRemainingMinutes).toBeGreaterThan(10);
    expect(card?.timeoutLabel).toContain('автоспора');
    expect(card?.problemHref).toContain('/support?');
    expect(card?.problemHref).toContain('dealId=ord-1');
    expect(card?.problemHref).toContain('offerId=8301234567');
    expect(card?.problemHref).toContain('topic=deal');
  });

  it('partitions buyer purchases from seller sales', () => {
    const { buyers, sellers } = partitionActiveTrades([
      baseTrade({ orderId: 'b1' }),
      baseTrade({ orderId: 's1', role: 'seller' }),
      baseTrade({ orderId: 'b2', offerId: null }),
    ]);
    expect(buyers).toHaveLength(2);
    expect(sellers).toHaveLength(1);
    expect(buildBuyerInbox([...buyers, ...sellers])).toHaveLength(2);
  });
});
