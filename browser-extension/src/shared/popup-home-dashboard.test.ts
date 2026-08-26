import { describe, expect, it } from 'vitest';
import type { TradeVerificationResult } from '@rip-market/extension-orchestrator';
import type { SessionHealth } from './session-health.js';
import {
  buildActionRequiredQueue,
  buildHomeDashboard,
  isTradeActionRequired,
  resolveConnectionDashboard,
} from './popup-home-dashboard.js';

function baseTrade(
  overrides: Partial<TradeVerificationResult> &
    Pick<TradeVerificationResult, 'orderId' | 'role' | 'nextAction'>,
): TradeVerificationResult {
  return {
    orderShortId: overrides.orderId.slice(0, 8),
    orderStatus: 'WAITING_TRADE',
    offerId: null,
    verificationStatus: 'pending',
    checks: [],
    item: {
      marketHashName: 'AK-47 | Redline',
      floatValue: null,
      wear: null,
      iconUrl: null,
      assetExternalId: '1',
    },
    counterparty: {
      userId: 'u2',
      username: 'other',
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
    siteUrl: 'https://p2pcs.ru/orders/abc',
    amountMinor: '1000',
    ...overrides,
  };
}

function health(code: SessionHealth['code']): SessionHealth {
  return {
    code,
    title: code,
    message: `msg:${code}`,
    ctaLabel: 'CTA',
    ctaUrl: 'https://p2pcs.ru/account',
    supportCode: code,
    sessionSteamId: '1',
    expectedSteamId: '2',
    checkedAt: '2026-08-26T00:00:00.000Z',
  };
}

describe('popup-home-dashboard', () => {
  it('reports site + Steam alignment on connection strip', () => {
    expect(
      resolveConnectionDashboard({
        connected: false,
        health: null,
      }).tone,
    ).toBe('off');

    const ok = resolveConnectionDashboard({
      connected: true,
      expiresAt: '2026-08-26T12:00:00.000Z',
      health: health('OK'),
    });
    expect(ok.tone).toBe('ok');
    expect(ok.steamAligned).toBe(true);
    expect(ok.steamLabel).toMatch(/совпадают/i);

    const mismatch = resolveConnectionDashboard({
      connected: true,
      health: health('STEAM_ACCOUNT_MISMATCH'),
    });
    expect(mismatch.tone).toBe('error');
    expect(mismatch.steamAligned).toBe(false);
  });

  it('puts Guard / Accept / Mismatch / Re-pair into action queue by priority', () => {
    const trades = [
      baseTrade({
        orderId: 'wait-1',
        role: 'buyer',
        nextAction: {
          kind: 'wait',
          title: 'Ждём',
          description: 'продавца',
        },
      }),
      baseTrade({
        orderId: 'accept-1',
        role: 'buyer',
        offerId: '99',
        nextAction: {
          kind: 'accept_in_steam',
          title: 'Примите',
          description: 'в Steam',
        },
      }),
      baseTrade({
        orderId: 'guard-1',
        role: 'seller',
        offerId: '88',
        nextAction: {
          kind: 'confirm_guard',
          title: 'Guard',
          description: 'Mobile',
        },
      }),
      baseTrade({
        orderId: 'mismatch-1',
        role: 'buyer',
        offerId: '77',
        verificationStatus: 'mismatch',
        nextAction: {
          kind: 'report_issue',
          title: 'Не совпадает',
          description: 'не принимайте',
        },
      }),
    ];

    const queue = buildActionRequiredQueue({
      connected: false,
      health: health('EXT_DISCONNECTED'),
      trades,
    });

    expect(queue[0]?.kind).toBe('re_pair');
    expect(queue.map((item) => item.kind)).toEqual([
      're_pair',
      'mismatch',
      'confirm_guard',
      'accept_offer',
    ]);
    expect(isTradeActionRequired(trades[0]!)).toBe(false);
  });

  it('keeps wait/verifying deals in lists and actionables only in queue', () => {
    const trades = [
      baseTrade({
        orderId: 'accept-1',
        role: 'buyer',
        offerId: '99',
        nextAction: {
          kind: 'accept_in_steam',
          title: 'Примите',
          description: 'в Steam',
        },
      }),
      baseTrade({
        orderId: 'wait-1',
        role: 'buyer',
        nextAction: {
          kind: 'wait',
          title: 'Ждём',
          description: 'оффер',
        },
      }),
      baseTrade({
        orderId: 'verify-1',
        role: 'seller',
        orderStatus: 'TRADE_CONFIRMED',
        nextAction: {
          kind: 'platform_verifying',
          title: 'Проверка',
          description: 'доставка',
        },
      }),
    ];

    const home = buildHomeDashboard({
      connected: true,
      health: health('OK'),
      trades,
    });

    expect(home.actionItems).toHaveLength(1);
    expect(home.actionItems[0]?.kind).toBe('accept_offer');
    expect(home.buyers).toHaveLength(1);
    expect(home.buyers[0]?.orderId).toBe('wait-1');
    expect(home.sellers).toHaveLength(1);
    expect(home.sellers[0]?.orderId).toBe('verify-1');
    expect(home.counts.total).toBe(3);
    expect(home.receipts).toHaveLength(0);
    expect(home.emptyHome).toBe(false);
  });

  it('surfaces completed deals as receipts, not active lists', () => {
    const home = buildHomeDashboard({
      connected: true,
      health: health('OK'),
      trades: [
        baseTrade({
          orderId: 'done-1',
          role: 'buyer',
          orderStatus: 'COMPLETED',
          offerId: '42',
          commissionMinor: '50',
          sellerReceiveMinor: '950',
          amountMinor: '1000',
          nextAction: {
            kind: 'completed',
            title: 'Готово',
            description: '…',
          },
        }),
      ],
    });
    expect(home.buyers).toHaveLength(0);
    expect(home.sellers).toHaveLength(0);
    expect(home.receipts).toHaveLength(1);
    expect(home.receipts[0]?.offerId).toBe('42');
    expect(home.receipts[0]?.commissionMinor).toBe('50');
    expect(home.emptyHome).toBe(false);
  });

  it('marks empty calm home when connected and nothing pending', () => {
    const home = buildHomeDashboard({
      connected: true,
      health: health('OK'),
      trades: [],
    });
    expect(home.emptyHome).toBe(true);
    expect(home.counts.action).toBe(0);
    expect(home.receipts).toHaveLength(0);
  });
});
