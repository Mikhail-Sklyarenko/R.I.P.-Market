import { describe, expect, it } from 'vitest';
import type { TradeVerificationResult } from '@rip-market/extension-orchestrator';
import {
  resolveHealthNextAction,
  resolveTradeNextAction,
} from './popup-next-action.js';
import type { SessionHealth } from './session-health.js';

function trade(
  overrides: Partial<TradeVerificationResult> &
    Pick<TradeVerificationResult, 'orderId' | 'role' | 'nextAction'>,
): TradeVerificationResult {
  return {
    orderShortId: 'abcd1234',
    orderStatus: 'WAITING_TRADE',
    offerId: null,
    verificationStatus: 'pending',
    checks: [],
    item: {
      marketHashName: 'AWP | Asiimov',
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
    escrow: { holdAmountMinor: '500', status: 'active' },
    acknowledgments: {
      sellerAckSent: false,
      buyerPreAccept: false,
      buyerReceived: false,
    },
    siteUrl: 'https://p2pcs.ru/orders/abc',
    amountMinor: '500',
    buyerTradeUrl:
      'https://steamcommunity.com/tradeoffer/new/?partner=1&token=x',
    ...overrides,
  };
}

describe('popup-next-action engine', () => {
  it('seller: Guard / Trade URL / retry as single primary', () => {
    const guard = resolveTradeNextAction(
      trade({
        orderId: 'g1',
        role: 'seller',
        offerId: '10',
        nextAction: {
          kind: 'confirm_guard',
          title: 'Guard',
          description: 'mobile',
        },
      }),
    );
    expect(guard.primary.id).toBe('confirm_guard');
    expect(guard.primary.label).toMatch(/Steam Mobile/i);
    expect(guard.primary.mode).toBe('link');

    const manual = resolveTradeNextAction(
      trade({
        orderId: 'm1',
        role: 'seller',
        nextAction: {
          kind: 'send_manual',
          title: 'Вручную',
          description: 'send',
        },
      }),
    );
    expect(manual.primary.id).toBe('open_trade_url');
    expect(manual.overflow.some((item) => item.id === 'retry_send')).toBe(true);

    const retryOnly = resolveTradeNextAction(
      trade({
        orderId: 'r1',
        role: 'seller',
        buyerTradeUrl: null,
        nextAction: {
          kind: 'send_manual',
          title: 'Вручную',
          description: 'send',
        },
      }),
    );
    expect(retryOnly.primary.id).toBe('retry_send');
    expect(retryOnly.primary.mode).toBe('runtime');
  });

  it('buyer: verified offer / wait / dispute as single primary', () => {
    const accept = resolveTradeNextAction(
      trade({
        orderId: 'a1',
        role: 'buyer',
        offerId: '55',
        nextAction: {
          kind: 'accept_in_steam',
          title: 'Примите',
          description: 'steam',
        },
      }),
    );
    expect(accept.primary.id).toBe('open_verified_offer');
    expect(accept.primary.href).toContain('/tradeoffer/55/');
    expect(accept.overflow.some((item) => item.id === 'pre_accept_ack')).toBe(
      true,
    );

    const wait = resolveTradeNextAction(
      trade({
        orderId: 'w1',
        role: 'buyer',
        nextAction: {
          kind: 'wait',
          title: 'Ждём',
          description: 'seller',
        },
      }),
    );
    expect(wait.primary.id).toBe('wait_seller');

    const dispute = resolveTradeNextAction(
      trade({
        orderId: 'd1',
        role: 'buyer',
        offerId: '9',
        verificationStatus: 'mismatch',
        nextAction: {
          kind: 'report_issue',
          title: 'Mismatch',
          description: 'stop',
        },
      }),
    );
    expect(dispute.primary.id).toBe('open_dispute');
    expect(dispute.primary.href).toContain('/support?');
    expect(dispute.primary.href).toContain('evidence=');
    expect(dispute.primary.href).toContain('reason=mismatch');
  });

  it('uses ack button as primary when that is the next action', () => {
    const sent = resolveTradeNextAction(
      trade({
        orderId: 's1',
        role: 'seller',
        offerId: '1',
        nextAction: {
          kind: 'confirm_sent',
          title: 'Подтвердите',
          description: 'sent',
        },
      }),
    );
    expect(sent.primary.mode).toBe('button');
    expect(sent.primary.ackType).toBe('SELLER_ACK_SENT');

    const received = resolveTradeNextAction(
      trade({
        orderId: 'b1',
        role: 'buyer',
        offerId: '2',
        nextAction: {
          kind: 'confirm_received',
          title: 'Получено',
          description: 'inv',
        },
      }),
    );
    expect(received.primary.id).toBe('confirm_received_ack');
    expect(received.primary.mode).toBe('button');
  });

  it('resolves health re-pair as single primary', () => {
    const health: SessionHealth = {
      code: 'SESSION_REVOKED',
      title: 'Сессия',
      message: 'pair again',
      ctaLabel: 'Подключить',
      ctaUrl: 'https://p2pcs.ru/account',
      supportCode: 'SESSION_REVOKED',
      sessionSteamId: null,
      expectedSteamId: null,
      checkedAt: '2026-08-26T00:00:00.000Z',
    };
    const resolved = resolveHealthNextAction(health);
    expect(resolved.primary.id).toBe('re_pair');
    expect(resolved.overflow).toHaveLength(0);
  });
});
