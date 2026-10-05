import { describe, expect, it } from 'vitest';
import type { TradeVerificationResult } from '@rip-market/extension-orchestrator';
import {
  buildSettlementTransparency,
  formatSettlementHoldUntil,
} from './settlement-transparency.js';

function trade(
  overrides: Partial<TradeVerificationResult> = {},
): TradeVerificationResult {
  return {
    orderId: 'order-settle',
    orderShortId: 'ord-set1',
    role: 'seller',
    orderStatus: 'SETTLEMENT_HOLD',
    offerId: '111',
    verificationStatus: 'verified',
    checks: [],
    item: {
      marketHashName: 'AK-47 | Redline',
      floatValue: null,
      wear: 'FT',
      iconUrl: null,
      assetExternalId: 'a1',
    },
    counterparty: {
      userId: 'b1',
      username: 'buyer',
      steamId: '1',
      personaName: null,
      avatarUrl: null,
    },
    escrow: { holdAmountMinor: '2000', status: 'active' },
    acknowledgments: {
      sellerAckSent: true,
      buyerPreAccept: true,
      buyerReceived: true,
    },
    nextAction: {
      kind: 'platform_verifying',
      title: 'Hold',
      description: 'x',
    },
    siteUrl: 'https://p2pcs.ru/orders/order-settle',
    amountMinor: '2000',
    settlementHoldUntil: '2026-09-04T12:00:00.000Z',
    deliveryProgress: null,
    ...overrides,
  };
}

describe('settlement-transparency', () => {
  it('formats hold-until date', () => {
    expect(
      formatSettlementHoldUntil('2026-09-04T12:00:00.000Z', 'ru', Date.parse('2026-08-27T00:00:00Z')),
    ).toMatch(/2026|сент|Sep/i);
  });

  it('shows funds available line for seller on SETTLEMENT_HOLD', () => {
    const view = buildSettlementTransparency(trade(), {
      locale: 'ru',
      nowMs: Date.parse('2026-08-27T00:00:00Z'),
    });
    expect(view?.phase).toBe('settlement_hold');
    expect(view?.fundsLine).toMatch(/Средства защищены/i);
    expect(view?.holdUntilLabel).toBeTruthy();
  });

  it('shows dual-signal progress on TRADE_CONFIRMED', () => {
    const view = buildSettlementTransparency(
      trade({
        orderStatus: 'TRADE_CONFIRMED',
        settlementHoldUntil: null,
        deliveryProgress: {
          offerTone: 'ok',
          inventoryTone: 'pending',
          offerStatus: 'Accepted',
          inventoryHint: 'pending',
          outcome: 'confirming',
          checkedAt: '2026-08-27T00:00:00.000Z',
        },
      }),
    );
    expect(view?.phase).toBe('delivery_verifying');
    expect(view?.signals).toHaveLength(2);
    expect(view?.signals?.[0]?.tone).toBe('ok');
    expect(view?.fundsLine).toBeNull();
  });

  it('returns null outside post-accept statuses', () => {
    expect(
      buildSettlementTransparency(
        trade({ orderStatus: 'WAITING_TRADE', settlementHoldUntil: null }),
      ),
    ).toBeNull();
  });
  it.each(['buyer', 'seller'] as const)('uses only server deadline with no receipt acknowledgement for %s', role => {
    const serverDate = '2026-10-12T14:40:08.629Z';
    const view = buildSettlementTransparency(trade({ role, settlementHoldUntil: serverDate, acknowledgments: { sellerAckSent: false, buyerPreAccept: false, buyerReceived: false } }));
    expect(view?.holdUntilIso).toBe(serverDate);
    expect(view?.body).not.toMatch(/API|ключ|откройте расширение|Предмет у меня/i);
    expect(buildSettlementTransparency(trade({ role, settlementHoldUntil: null }))?.holdUntilIso).toBeNull();
  });
});
