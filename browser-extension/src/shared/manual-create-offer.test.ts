import { describe, expect, it } from 'vitest';
import type { TradeVerificationResult } from '@rip-market/extension-orchestrator';
import {
  buildManualCreateCandidate,
  buildManualCreateDraftInput,
  canManualCreateOffer,
  listManualCreateCandidates,
} from './manual-create-offer.js';

function trade(
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
      marketHashName: 'M4A1-S | Printstream',
      floatValue: '0.12',
      wear: 'FT',
      iconUrl: null,
      assetExternalId: 'asset-99',
    },
    counterparty: {
      userId: 'buyer',
      username: 'buyer',
      steamId: '1',
      personaName: null,
      avatarUrl: null,
    },
    escrow: { holdAmountMinor: '100', status: 'active' },
    acknowledgments: {
      sellerAckSent: false,
      buyerPreAccept: false,
      buyerReceived: false,
    },
    siteUrl: `https://p2pcs.ru/orders/${overrides.orderId}`,
    amountMinor: '1500',
    buyerTradeUrl:
      'https://steamcommunity.com/tradeoffer/new/?partner=1&token=abc',
    ...overrides,
  };
}

describe('manual-create-offer', () => {
  it('allows seller manual/waiting deals without offerId', () => {
    expect(
      canManualCreateOffer(
        trade({
          orderId: 'o1',
          role: 'seller',
          nextAction: {
            kind: 'send_manual',
            title: 'Вручную',
            description: 'x',
          },
        }),
      ),
    ).toBe(true);

    expect(
      canManualCreateOffer(
        trade({
          orderId: 'o2',
          role: 'seller',
          nextAction: { kind: 'wait', title: 'Ждём', description: 'x' },
        }),
      ),
    ).toBe(true);

    expect(
      canManualCreateOffer(
        trade({
          orderId: 'o3',
          role: 'seller',
          offerId: '123',
          nextAction: {
            kind: 'confirm_guard',
            title: 'Guard',
            description: 'x',
          },
        }),
      ),
    ).toBe(false);

    expect(
      canManualCreateOffer(
        trade({
          orderId: 'o4',
          role: 'buyer',
          nextAction: {
            kind: 'accept_in_steam',
            title: 'Accept',
            description: 'x',
          },
        }),
      ),
    ).toBe(false);
  });

  it('builds CTA and draft for autofill pipeline', () => {
    const candidate = buildManualCreateCandidate(
      trade({
        orderId: 'order-manual',
        role: 'seller',
        nextAction: {
          kind: 'send_manual',
          title: 'Вручную',
          description: 'x',
        },
      }),
    );
    expect(candidate?.ctaLabel).toMatch(/Собрать оффер/i);
    expect(candidate?.reason).toBe('send_manual');

    const draft = buildManualCreateDraftInput(candidate!);
    expect(draft.buyerTradeUrl).toContain('tradeoffer/new');
    expect(draft.item.assetId).toBe('asset-99');
    expect(draft.note).toContain('order-ma');
    expect(draft.taskId).toBe('manual-order-manual');
  });

  it('lists send_manual before waiting_no_offer', () => {
    const list = listManualCreateCandidates([
      trade({
        orderId: 'wait-1',
        role: 'seller',
        nextAction: { kind: 'wait', title: 'w', description: 'w' },
      }),
      trade({
        orderId: 'manual-1',
        role: 'seller',
        nextAction: {
          kind: 'send_manual',
          title: 'm',
          description: 'm',
        },
      }),
    ]);
    expect(list.map((entry) => entry.orderId)).toEqual([
      'manual-1',
      'wait-1',
    ]);
  });
});
