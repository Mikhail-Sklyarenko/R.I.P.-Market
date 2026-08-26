import { describe, expect, it } from 'vitest';
import type { TradeVerificationResult } from '@rip-market/extension-orchestrator';
import {
  buildPostTradeReceipt,
  buildRecentReceipts,
  canShowPostTradeReceipt,
  resolveCommissionMinor,
  resolveSellerReceiveMinor,
} from './post-trade-receipt.js';

function trade(
  overrides: Partial<TradeVerificationResult> = {},
): TradeVerificationResult {
  return {
    orderId: 'ord-complete-1',
    orderShortId: 'ord-comp',
    role: 'buyer',
    orderStatus: 'COMPLETED',
    offerId: '830999',
    verificationStatus: 'verified',
    checks: [],
    item: {
      marketHashName: 'AK-47 | Redline (Field-Tested)',
      floatValue: null,
      wear: 'FT',
      iconUrl: null,
      assetExternalId: '1',
    },
    counterparty: {
      userId: 'u2',
      username: 'seller',
      steamId: null,
      personaName: null,
      avatarUrl: null,
    },
    escrow: { holdAmountMinor: '10000', status: 'released' },
    acknowledgments: {
      sellerAckSent: true,
      buyerPreAccept: true,
      buyerReceived: true,
    },
    nextAction: {
      kind: 'completed',
      title: 'Сделка завершена',
      description: 'Готово',
    },
    siteUrl: 'https://p2pcs.ru/orders/ord-complete-1',
    amountMinor: '10000',
    commissionMinor: '500',
    sellerReceiveMinor: '9500',
    ...overrides,
  };
}

describe('post-trade-receipt', () => {
  it('resolves fee with 5% floor fallback', () => {
    expect(resolveCommissionMinor('10000')).toBe('500');
    expect(resolveCommissionMinor('10000', '400')).toBe('400');
    expect(resolveSellerReceiveMinor('10000', '500')).toBe('9500');
    expect(resolveSellerReceiveMinor('10000', '500', '9400')).toBe('9400');
  });

  it('builds buyer and seller receipt views', () => {
    expect(canShowPostTradeReceipt(trade())).toBe(true);
    const buyer = buildPostTradeReceipt(trade());
    expect(buyer?.verbLabel).toBe('Купили');
    expect(buyer?.netMinor).toBe('10000');
    expect(buyer?.commissionMinor).toBe('500');
    expect(buyer?.offerId).toBe('830999');

    const seller = buildPostTradeReceipt(
      trade({ role: 'seller', orderId: 'ord-s' }),
    );
    expect(seller?.verbLabel).toBe('Продали');
    expect(seller?.netMinor).toBe('9500');
    expect(seller?.netCaption).toBe('К зачислению');
  });

  it('hides receipt for in-flight deals', () => {
    expect(
      buildPostTradeReceipt(
        trade({
          orderStatus: 'WAITING_TRADE',
          nextAction: {
            kind: 'wait',
            title: 'Ждём',
            description: '…',
          },
        }),
      ),
    ).toBeNull();
  });

  it('collects recent receipts in API order', () => {
    const receipts = buildRecentReceipts([
      trade({ orderId: 'a', orderShortId: 'aaaa' }),
      trade({
        orderId: 'b',
        orderShortId: 'bbbb',
        orderStatus: 'WAITING_TRADE',
        nextAction: { kind: 'wait', title: 'x', description: 'y' },
      }),
      trade({ orderId: 'c', orderShortId: 'cccc', role: 'seller' }),
    ]);
    expect(receipts.map((r) => r.orderId)).toEqual(['a', 'c']);
  });
});
