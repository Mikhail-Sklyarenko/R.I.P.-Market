import { describe, expect, it } from 'vitest';
import type { TradeVerificationResult } from '@rip-market/extension-orchestrator';
import {
  applyQuietNotifyPlan,
  buildQuietNotifyEvent,
  defaultQuietNotifyState,
  muteQuietNotifyOrder,
  planQuietNotifications,
  pruneQuietNotifyFingerprints,
  resolveQuietNotifyKind,
} from './quiet-notifications.js';

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
    escrow: { holdAmountMinor: '100', status: 'active' },
    acknowledgments: {
      sellerAckSent: false,
      buyerPreAccept: false,
      buyerReceived: false,
    },
    siteUrl: `https://p2pcs.ru/orders/${overrides.orderId}`,
    amountMinor: '100',
    ...overrides,
  };
}

describe('quiet-notifications', () => {
  it('maps Guard / Accept / Mismatch / new sale kinds', () => {
    expect(
      resolveQuietNotifyKind(
        trade({
          orderId: 'g1',
          role: 'seller',
          nextAction: {
            kind: 'confirm_guard',
            title: 'g',
            description: 'g',
          },
        }),
      ),
    ).toBe('confirm_guard');
    expect(
      resolveQuietNotifyKind(
        trade({
          orderId: 'a1',
          role: 'buyer',
          offerId: '9',
          nextAction: {
            kind: 'accept_in_steam',
            title: 'a',
            description: 'a',
          },
        }),
      ),
    ).toBe('accept_ready');
    expect(
      resolveQuietNotifyKind(
        trade({
          orderId: 'm1',
          role: 'buyer',
          verificationStatus: 'mismatch',
          nextAction: {
            kind: 'report_issue',
            title: 'm',
            description: 'm',
          },
        }),
      ),
    ).toBe('mismatch');
    expect(
      resolveQuietNotifyKind(
        trade({
          orderId: 'n1',
          role: 'seller',
          offerId: null,
          nextAction: { kind: 'wait', title: 'w', description: 'w' },
        }),
      ),
    ).toBe('new_deal');
    expect(
      resolveQuietNotifyKind(
        trade({
          orderId: 'w1',
          role: 'buyer',
          nextAction: { kind: 'wait', title: 'w', description: 'w' },
        }),
      ),
    ).toBeNull();
  });

  it('notifies once per fingerprint and groups multiples', () => {
    const trades = [
      trade({
        orderId: 'order-guard',
        role: 'seller',
        offerId: '1',
        nextAction: {
          kind: 'confirm_guard',
          title: 'Guard',
          description: 'mobile',
        },
      }),
      trade({
        orderId: 'order-accept',
        role: 'buyer',
        offerId: '2',
        nextAction: {
          kind: 'accept_in_steam',
          title: 'Accept',
          description: 'steam',
        },
      }),
      trade({
        orderId: 'order-mismatch',
        role: 'buyer',
        offerId: '3',
        verificationStatus: 'mismatch',
        nextAction: {
          kind: 'report_issue',
          title: 'Mismatch',
          description: 'stop',
        },
      }),
    ];

    const first = planQuietNotifications({
      trades,
      state: defaultQuietNotifyState(),
      nowMs: 1_000_000,
    });
    expect(first.type).toBe('group');
    if (first.type !== 'group') {
      return;
    }
    expect(first.events).toHaveLength(3);
    expect(first.title).toMatch(/требуют действия|mismatch|Guard|accept/i);

    const after = applyQuietNotifyPlan(defaultQuietNotifyState(), first);
    const second = planQuietNotifications({
      trades,
      state: after,
      nowMs: 1_000_000 + 60_000,
    });
    expect(second.type).toBe('none');
  });

  it('respects mute and builds catalog copy', () => {
    const guardTrade = trade({
      orderId: 'order-guard',
      role: 'seller',
      offerId: '1',
      nextAction: {
        kind: 'confirm_guard',
        title: 'Guard',
        description: 'mobile',
      },
    });
    const event = buildQuietNotifyEvent(guardTrade);
    expect(event?.title).toMatch(/подтвердите Guard/i);

    const muted = muteQuietNotifyOrder(defaultQuietNotifyState(), 'order-guard');
    const plan = planQuietNotifications({
      trades: [guardTrade],
      state: muted,
      nowMs: 1_000_000,
    });
    expect(plan.type).toBe('none');
  });

  it('prunes fingerprints for finished orders', () => {
    const state = {
      ...defaultQuietNotifyState(),
      fingerprints: { a: 'fp-a', b: 'fp-b' },
      mutedOrderIds: ['a', 'c'],
    };
    const pruned = pruneQuietNotifyFingerprints(state, ['b']);
    expect(pruned.fingerprints).toEqual({ b: 'fp-b' });
    expect(pruned.mutedOrderIds).toEqual([]);
  });
});
