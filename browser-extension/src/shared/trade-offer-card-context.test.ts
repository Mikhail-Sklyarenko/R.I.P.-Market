import { describe, expect, it } from 'vitest';
import type { TradeVerificationResult } from '@rip-market/extension-orchestrator';
import {
  buildOfferCardContext,
  platformStatusForTrade,
  roleLabelForTrade,
} from './trade-offer-card-context.js';

function trade(
  overrides: Partial<TradeVerificationResult> = {},
): TradeVerificationResult {
  return {
    orderId: 'order-context-123456',
    orderShortId: 'ord-ctx1',
    role: 'buyer',
    orderStatus: 'WAITING_TRADE',
    offerId: '999',
    verificationStatus: 'verified',
    checks: [],
    item: {
      marketHashName: 'USP-S | Kill Confirmed',
      floatValue: null,
      wear: 'FT',
      iconUrl: null,
      assetExternalId: 'a1',
    },
    counterparty: {
      userId: 's1',
      username: 'seller',
      steamId: '1',
      personaName: 'Seller',
      avatarUrl: null,
    },
    escrow: { holdAmountMinor: '1500', status: 'active' },
    acknowledgments: {
      sellerAckSent: true,
      buyerPreAccept: false,
      buyerReceived: false,
    },
    nextAction: {
      kind: 'accept_in_steam',
      title: 'Примите обмен',
      description: 'x',
    },
    siteUrl: 'https://p2pcs.ru/orders/order-context-123456',
    amountMinor: '1500',
    ...overrides,
  };
}

describe('trade-offer-card-context', () => {
  it('labels role as Покупка / Продажа', () => {
    expect(roleLabelForTrade('buyer')).toBe('Покупка');
    expect(roleLabelForTrade('seller')).toBe('Продажа');
  });

  it('maps platform status for accept / guard / mismatch / hold', () => {
    expect(platformStatusForTrade(trade()).label).toBe('Ждёт Accept');
    expect(
      platformStatusForTrade(
        trade({
          role: 'seller',
          nextAction: {
            kind: 'confirm_guard',
            title: 'Guard',
            description: 'x',
          },
        }),
      ).label,
    ).toBe('Ждём Guard');
    expect(
      platformStatusForTrade(
        trade({
          verificationStatus: 'mismatch',
          nextAction: {
            kind: 'report_issue',
            title: 'Проблема',
            description: 'x',
          },
        }),
      ),
    ).toMatchObject({ label: 'Не совпадает', tone: 'error' });
    expect(
      platformStatusForTrade(
        trade({
          orderStatus: 'SETTLEMENT_HOLD',
          nextAction: {
            kind: 'platform_verifying',
            title: 'Hold',
            description: 'x',
          },
        }),
      ).label,
    ).toBe('Проверка площадки');
  });

  it('builds card summary with order, price, role, status', () => {
    const ctx = buildOfferCardContext(trade());
    expect(ctx.orderShortId).toBe('ord-ctx1');
    expect(ctx.priceLabel).toBe('$15.00');
    expect(ctx.roleLabel).toBe('Покупка');
    expect(ctx.platformStatusLabel).toBe('Ждёт Accept');
    expect(ctx.summaryLine).toBe(
      '#ord-ctx1 · $15.00 · Покупка · Ждёт Accept',
    );
    expect(ctx.itemName).toContain('Kill Confirmed');
  });
});
