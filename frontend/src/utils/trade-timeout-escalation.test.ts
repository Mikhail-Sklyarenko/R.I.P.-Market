import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildTradeEscalationPack,
  buildTradeProblemSupportPath,
  formatTradeEscalationTicketBody,
  parseSupportEscalationFromSearch,
  resolveTradeTimeoutView,
  shouldShowTradeTimeout,
} from './trade-timeout-escalation.ts';

describe('resolveTradeTimeoutView', () => {
  it('returns human parts and urgency bands', () => {
    const now = Date.parse('2026-08-26T12:00:00.000Z');
    const createdAt = new Date(now - 50 * 60_000).toISOString();
    const view = resolveTradeTimeoutView({
      orderCreatedAt: createdAt,
      timeoutMinutes: 60,
      nowMs: now,
    });
    assert.ok(view);
    assert.equal(view!.remainingMinutes, 10);
    assert.equal(view!.urgency, 'soon');
    assert.equal(view!.hours, 0);
    assert.equal(view!.minutesPart, 10);
  });

  it('marks critical and expired', () => {
    const now = Date.parse('2026-08-26T12:00:00.000Z');
    const critical = resolveTradeTimeoutView({
      orderCreatedAt: new Date(now - 57 * 60_000).toISOString(),
      timeoutMinutes: 60,
      nowMs: now,
    });
    assert.equal(critical?.urgency, 'critical');

    const expired = resolveTradeTimeoutView({
      orderCreatedAt: new Date(now - 90 * 60_000).toISOString(),
      timeoutMinutes: 60,
      nowMs: now,
    });
    assert.equal(expired?.urgency, 'expired');
    assert.equal(expired?.remainingMinutes, 0);
  });
});

describe('shouldShowTradeTimeout', () => {
  it('shows during trade / dispute window', () => {
    assert.equal(shouldShowTradeTimeout('WAITING_TRADE'), true);
    assert.equal(shouldShowTradeTimeout('TRADE_CONFIRMED'), true);
    assert.equal(shouldShowTradeTimeout('DISPUTE'), true);
    assert.equal(shouldShowTradeTimeout('COMPLETED'), false);
  });
});

describe('escalation path + body', () => {
  it('builds support path with deal/offer/topic and pack fields', () => {
    const order = {
      id: 'ord-42',
      status: 'WAITING_TRADE' as const,
      tradeOperation: { externalOfferId: '830111' },
      tradeVerification: {
        status: 'mismatch' as const,
        match: false,
        updatedAt: '2026-08-26T12:00:00.000Z',
        offerId: '830111',
        failedChecks: [{ key: 'asset_id', label: 'asset', severity: 'error' as const }],
        nextAction: {
          kind: 'report_issue' as const,
          title: 'x',
          description: 'y',
        },
      },
    };

    const path = buildTradeProblemSupportPath({
      order,
      role: 'buyer',
      reason: 'mismatch',
      remainingMinutes: 4,
    });
    assert.match(path, /^\/support\?/);
    const query = new URLSearchParams(path.slice('/support?'.length));
    assert.equal(query.get('dealId'), 'ord-42');
    assert.equal(query.get('offerId'), '830111');
    assert.equal(query.get('topic'), 'deal');
    assert.equal(query.get('reason'), 'mismatch');
    assert.equal(query.get('verifyStatus'), 'mismatch');
    assert.ok(query.get('evidence'));
    assert.equal(query.get('failedChecks'), 'asset_id');
    assert.equal(query.get('nextAction'), 'report_issue');

    const pack = buildTradeEscalationPack({
      order,
      role: 'buyer',
      reason: 'mismatch',
      remainingMinutes: 4,
    });
    const body = formatTradeEscalationTicketBody(pack, 'Скин не тот');
    assert.match(body, /Deal ID: ord-42/);
    assert.match(body, /Offer ID: 830111/);
    assert.match(body, /Verify status: mismatch/);
    assert.match(body, /Скин не тот/);

    const roundTrip = parseSupportEscalationFromSearch(
      new URLSearchParams(path.slice('/support?'.length)),
    );
    assert.ok(roundTrip.evidence);
    assert.equal(roundTrip.evidence!.orderId, 'ord-42');
    assert.equal(roundTrip.evidence!.reason, 'mismatch');
    assert.deepEqual(roundTrip.evidence!.failedCheckKeys, ['asset_id']);
  });

  it('decodes extension-shaped evidence without remainingMinutes', () => {
    const extensionPack = {
      version: 1 as const,
      reason: 'mismatch' as const,
      orderId: 'ord-ext',
      offerId: '99',
      orderStatus: 'WAITING_TRADE',
      role: 'buyer' as const,
      verificationStatus: 'mismatch',
      failedCheckKeys: ['partner'],
      nextActionKind: 'report_issue',
      tradeTimeoutAt: '2026-08-27T12:00:00.000Z',
      capturedAt: '2026-08-27T01:00:00.000Z',
    };
    const json = JSON.stringify(extensionPack);
    const bytes = new TextEncoder().encode(json);
    let binary = '';
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    const evidence = btoa(binary)
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replace(/=+$/g, '');
    const parsed = parseSupportEscalationFromSearch(
      new URLSearchParams(`dealId=ord-ext&evidence=${evidence}`),
    );
    assert.ok(parsed.evidence);
    assert.equal(parsed.evidence!.orderId, 'ord-ext');
    assert.equal(parsed.evidence!.tradeTimeoutAt, '2026-08-27T12:00:00.000Z');
    assert.equal(parsed.evidence!.remainingMinutes, null);
  });

  it('parses support query params', () => {
    const parsed = parseSupportEscalationFromSearch(
      new URLSearchParams(
        'dealId=abc&offerId=1&topic=deal&reason=timeout&verifyStatus=pending&failedChecks=a,b&nextAction=report_issue',
      ),
    );
    assert.equal(parsed.dealId, 'abc');
    assert.equal(parsed.offerId, '1');
    assert.equal(parsed.topic, 'deal');
    assert.equal(parsed.reason, 'timeout');
    assert.equal(parsed.verifyStatus, 'pending');
    assert.deepEqual(parsed.failedChecks, ['a', 'b']);
    assert.equal(parsed.nextAction, 'report_issue');
  });
});
