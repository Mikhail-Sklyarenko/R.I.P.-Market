import { describe, expect, it } from 'vitest';
import type { TradeVerificationResult } from '@rip-market/extension-orchestrator';
import {
  buildDisputeStatusView,
  buildInFlowDisputeEvidence,
  buildInFlowDisputeSupportUrl,
  decodeInFlowDisputeEvidence,
  encodeInFlowDisputeEvidence,
  formatInFlowDisputeTicketBody,
} from './in-flow-dispute.js';

function trade(
  overrides: Partial<TradeVerificationResult> = {},
): TradeVerificationResult {
  return {
    orderId: 'order-dispute-1',
    orderShortId: 'ord-dis1',
    role: 'buyer',
    orderStatus: 'WAITING_TRADE',
    offerId: '830999',
    verificationStatus: 'mismatch',
    checks: [
      {
        key: 'asset_id',
        passed: false,
        label: 'Asset',
        severity: 'error',
      },
      {
        key: 'escrow_active',
        passed: true,
        label: 'Escrow',
        severity: 'ok',
      },
    ],
    item: {
      marketHashName: 'AWP | Asiimov',
      floatValue: null,
      wear: 'FT',
      iconUrl: null,
      assetExternalId: 'a1',
    },
    counterparty: {
      userId: 's1',
      username: 'seller',
      steamId: '1',
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
      kind: 'report_issue',
      title: 'Mismatch',
      description: 'x',
    },
    siteUrl: 'https://p2pcs.ru/orders/order-dispute-1',
    amountMinor: '1000',
    tradeTimeoutAt: '2026-08-27T12:00:00.000Z',
    ...overrides,
  };
}

describe('in-flow-dispute', () => {
  it('builds evidence with failed checks and round-trips encode', () => {
    const evidence = buildInFlowDisputeEvidence(trade(), '2026-08-27T01:00:00.000Z');
    expect(evidence.reason).toBe('mismatch');
    expect(evidence.failedCheckKeys).toEqual(['asset_id']);
    const encoded = encodeInFlowDisputeEvidence(evidence);
    expect(decodeInFlowDisputeEvidence(encoded)).toEqual(evidence);
  });

  it('builds support URL with evidence query for extension → site', () => {
    const href = buildInFlowDisputeSupportUrl(
      trade(),
      { capturedAt: '2026-08-27T01:00:00.000Z' },
    );
    expect(href).toContain('https://p2pcs.ru/support?');
    expect(href).toContain('dealId=order-dispute-1');
    expect(href).toContain('offerId=830999');
    expect(href).toContain('reason=mismatch');
    expect(href).toContain('failedChecks=asset_id');
    expect(href).toContain('evidence=');
  });

  it('builds dispute_open status for DISPUTE orders', () => {
    const view = buildDisputeStatusView(
      trade({
        orderStatus: 'DISPUTE',
        verificationStatus: 'pending',
        nextAction: {
          kind: 'report_issue',
          title: 'Спор',
          description: 'x',
        },
      }),
    );
    expect(view?.phase).toBe('dispute_open');
    expect(view?.primaryLabel).toMatch(/спор/i);
    expect(view?.primaryHref).toContain('/support?');
  });

  it('formats ticket body with evidence snapshot', () => {
    const body = formatInFlowDisputeTicketBody(
      buildInFlowDisputeEvidence(trade(), '2026-08-27T01:00:00.000Z'),
    );
    expect(body).toContain('Deal ID: order-dispute-1');
    expect(body).toContain('Failed checks: asset_id');
    expect(body).toContain('Offer ID: 830999');
  });
});
