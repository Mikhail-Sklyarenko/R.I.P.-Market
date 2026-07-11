import { describe, expect, it, vi } from 'vitest';
import { MockSteamOfferAdapter } from '../adapters/mock-steam-offer-adapter.js';
import { InMemoryTaskProgressReporter } from '../api/task-progress-reporter.js';
import { OfferErrorCode } from '../error-codes.js';
import { CreateOfferOrchestrator } from './create-offer-orchestrator.js';
import type { PolledTradeTask } from '../types.js';

function baseTask(overrides: Partial<PolledTradeTask> = {}): PolledTradeTask {
  return {
    id: 'task-1',
    type: 'create_offer',
    orderId: 'order-1',
    tradeOperationId: 'trade-1',
    idempotencyKey: 'trade-task:create_offer:trade-1',
    executionPhase: null,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    attemptCount: 1,
    payload: {
      orderId: 'order-1',
      tradeOperationId: 'trade-1',
      sellerId: 'seller-1',
      buyerId: 'buyer-1',
      expectedAssetId: 'asset-123',
      marketHashName: 'AK-47 | Redline (Field-Tested)',
      buyerTradeUrl:
        'https://steamcommunity.com/tradeoffer/new/?partner=123&token=abc',
      inventoryAssetId: 'inv-1',
      idempotencyKey: 'trade-task:create_offer:trade-1',
    },
    ...overrides,
  };
}

describe('CreateOfferOrchestrator', () => {
  it('reports full execution phase sequence on happy path', async () => {
    const reporter = new InMemoryTaskProgressReporter();
    const orchestrator = new CreateOfferOrchestrator(
      new MockSteamOfferAdapter('happy_path'),
      reporter,
    );

    await orchestrator.processTask(baseTask());

    expect(reporter.reports.map((entry) => entry.phase)).toEqual([
      'ACKED',
      'TRADE_PAGE_OPENED',
      'OFFER_DRAFTED',
      'ITEM_SELECTED',
      'OFFER_SUBMITTED',
      'OFFER_SENT',
    ]);
  });

  it('fails when buyer trade url is invalid', async () => {
    const reporter = new InMemoryTaskProgressReporter();
    const orchestrator = new CreateOfferOrchestrator(
      new MockSteamOfferAdapter('happy_path'),
      reporter,
    );

    await orchestrator.processTask(
      baseTask({
        payload: {
          ...baseTask().payload,
          buyerTradeUrl: 'https://example.com/not-a-trade-url',
        },
      }),
    );

    expect(reporter.reports.at(-1)).toMatchObject({
      phase: 'OFFER_FAILED',
      reasonCode: OfferErrorCode.BUYER_TRADE_URL_INVALID,
    });
  });

  it('fails when logged-in Steam account does not match seller', async () => {
    const reporter = new InMemoryTaskProgressReporter();
    const orchestrator = new CreateOfferOrchestrator(
      new MockSteamOfferAdapter('happy_path'),
      reporter,
    );

    await orchestrator.processTask(
      baseTask({
        payload: {
          ...baseTask().payload,
          sellerSteamId: '76561198000000001',
        },
      }),
    );

    expect(reporter.reports.at(-1)).toMatchObject({
      phase: 'OFFER_FAILED',
      reasonCode: OfferErrorCode.STEAM_ACCOUNT_MISMATCH,
    });
  });

  it('fails when seller inventory is not loaded', async () => {
    const reporter = new InMemoryTaskProgressReporter();
    const orchestrator = new CreateOfferOrchestrator(
      new MockSteamOfferAdapter('inventory_not_loaded'),
      reporter,
    );

    await orchestrator.processTask(baseTask());

    expect(reporter.reports.at(-1)).toMatchObject({
      phase: 'OFFER_FAILED',
      reasonCode: OfferErrorCode.INVENTORY_NOT_LOADED,
    });
  });

  it('selects duplicate-name item by expected float', async () => {
    const reporter = new InMemoryTaskProgressReporter();
    const adapter = new MockSteamOfferAdapter('happy_path');
    vi.spyOn(adapter, 'loadSellerInventory').mockResolvedValue([
      {
        assetId: 'dup-1',
        marketHashName: 'AK-47 | Redline (Field-Tested)',
        floatValue: '0.100000',
      },
      {
        assetId: 'asset-123',
        marketHashName: 'AK-47 | Redline (Field-Tested)',
        floatValue: '0.254319',
      },
    ]);
    const orchestrator = new CreateOfferOrchestrator(adapter, reporter);

    await orchestrator.processTask(
      baseTask({
        payload: {
          ...baseTask().payload,
          expectedFloatValue: '0.254319',
        },
      }),
    );

    expect(reporter.reports.at(-1)).toMatchObject({
      phase: 'OFFER_SENT',
    });
  });

  it('fails with ITEM_MISMATCH when multiple inventory items share the name', async () => {
    const reporter = new InMemoryTaskProgressReporter();
    const adapter = new MockSteamOfferAdapter('happy_path');
    vi.spyOn(adapter, 'loadSellerInventory').mockResolvedValue([
      {
        assetId: 'dup-1',
        marketHashName: 'AK-47 | Redline (Field-Tested)',
      },
      {
        assetId: 'dup-2',
        marketHashName: 'AK-47 | Redline (Field-Tested)',
      },
    ]);
    const orchestrator = new CreateOfferOrchestrator(adapter, reporter);

    await orchestrator.processTask(baseTask());

    expect(reporter.reports.at(-1)).toMatchObject({
      phase: 'OFFER_FAILED',
      reasonCode: OfferErrorCode.ITEM_MISMATCH,
    });
  });

  it('skips ACKED when task already reached ACKED phase', async () => {
    const reporter = new InMemoryTaskProgressReporter();
    const orchestrator = new CreateOfferOrchestrator(
      new MockSteamOfferAdapter('happy_path'),
      reporter,
    );

    await orchestrator.processTask(baseTask({ executionPhase: 'ACKED' }));

    expect(reporter.reports.map((entry) => entry.phase)).not.toContain('ACKED');
    expect(reporter.reports[0]?.phase).toBe('TRADE_PAGE_OPENED');
  });

  it('does not resume when task is already CONFIRM_PENDING', async () => {
    const adapter = new MockSteamOfferAdapter('happy_path');
    const sendSpy = vi.spyOn(adapter, 'sendOffer');
    const reporter = new InMemoryTaskProgressReporter();
    const orchestrator = new CreateOfferOrchestrator(adapter, reporter);

    await orchestrator.processTask(
      baseTask({ executionPhase: 'CONFIRM_PENDING' }),
    );

    expect(sendSpy).not.toHaveBeenCalled();
    expect(reporter.reports).toHaveLength(0);
  });

  it('happy path reports OFFER_SENT only with valid offer id', async () => {
    const reporter = new InMemoryTaskProgressReporter();
    const orchestrator = new CreateOfferOrchestrator(
      new MockSteamOfferAdapter('happy_path'),
      reporter,
    );

    await orchestrator.processTask(baseTask());

    expect(reporter.reports.at(-1)).toMatchObject({
      phase: 'OFFER_SENT',
      offerId: '99887766',
    });
  });

  it('fails when buyer trade url is missing', async () => {
    const reporter = new InMemoryTaskProgressReporter();
    const orchestrator = new CreateOfferOrchestrator(
      new MockSteamOfferAdapter('happy_path'),
      reporter,
    );

    await orchestrator.processTask(
      baseTask({
        payload: {
          ...baseTask().payload,
          buyerTradeUrl: null,
        },
      }),
    );

    expect(reporter.reports.at(-1)).toMatchObject({
      phase: 'OFFER_FAILED',
      reasonCode: OfferErrorCode.BUYER_TRADE_URL_MISSING,
    });
  });

  it('fails when item is missing from inventory', async () => {
    const reporter = new InMemoryTaskProgressReporter();
    const orchestrator = new CreateOfferOrchestrator(
      new MockSteamOfferAdapter('item_missing'),
      reporter,
    );

    await orchestrator.processTask(baseTask());

    expect(reporter.reports.at(-1)).toMatchObject({
      phase: 'OFFER_FAILED',
      reasonCode: OfferErrorCode.ITEM_MISSING,
    });
  });

  it('stops at CONFIRM_PENDING without OFFER_SENT when offer id is invalid', async () => {
    const reporter = new InMemoryTaskProgressReporter();
    const orchestrator = new CreateOfferOrchestrator(
      new MockSteamOfferAdapter('confirm_pending'),
      reporter,
    );

    await orchestrator.processTask(baseTask());

    expect(reporter.reports.map((entry) => entry.phase)).toEqual([
      'ACKED',
      'TRADE_PAGE_OPENED',
      'OFFER_DRAFTED',
      'ITEM_SELECTED',
      'OFFER_SUBMITTED',
      'CONFIRM_PENDING',
    ]);
    expect(reporter.reports.some((entry) => entry.phase === 'OFFER_SENT')).toBe(false);
  });

  it('reports CONFIRM_PENDING and OFFER_SENT when guard is pending but offer id is valid', async () => {
    const reporter = new InMemoryTaskProgressReporter();
    const orchestrator = new CreateOfferOrchestrator(
      new MockSteamOfferAdapter('confirm_pending_with_offer_id'),
      reporter,
    );

    await orchestrator.processTask(baseTask());

    expect(reporter.reports.map((entry) => entry.phase)).toEqual([
      'ACKED',
      'TRADE_PAGE_OPENED',
      'OFFER_DRAFTED',
      'ITEM_SELECTED',
      'OFFER_SUBMITTED',
      'CONFIRM_PENDING',
      'OFFER_SENT',
    ]);
    expect(reporter.reports.at(-1)?.offerId).toBe('88776655');
  });

  it('fails when Steam returns an invalid offer id', async () => {
    const reporter = new InMemoryTaskProgressReporter();
    const orchestrator = new CreateOfferOrchestrator(
      new MockSteamOfferAdapter('invalid_offer_id'),
      reporter,
    );

    await orchestrator.processTask(baseTask());

    expect(reporter.reports.at(-1)).toMatchObject({
      phase: 'OFFER_FAILED',
      reasonCode: OfferErrorCode.OFFER_SEND_FAILED,
    });
  });

  it('resumes from OFFER_DRAFTED and reports send phases only', async () => {
    const reporter = new InMemoryTaskProgressReporter();
    const orchestrator = new CreateOfferOrchestrator(
      new MockSteamOfferAdapter('happy_path'),
      reporter,
    );

    await orchestrator.processTask(
      baseTask({ executionPhase: 'OFFER_DRAFTED' }),
    );

    expect(reporter.reports.map((entry) => entry.phase)).toEqual([
      'ITEM_SELECTED',
      'OFFER_SUBMITTED',
      'OFFER_SENT',
    ]);
  });

  it('is retry-safe on duplicate progress idempotency keys', async () => {
    const reporter = new InMemoryTaskProgressReporter();
    const orchestrator = new CreateOfferOrchestrator(
      new MockSteamOfferAdapter('happy_path'),
      reporter,
    );
    const task = baseTask();

    await orchestrator.processTask(task);
    const firstCount = reporter.reports.length;
    await orchestrator.processTask(task);
    expect(reporter.reports.length).toBe(firstCount);
  });

  it('does not resend when task already reached OFFER_SENT', async () => {
    const adapter = new MockSteamOfferAdapter('happy_path');
    const sendSpy = vi.spyOn(adapter, 'sendOffer');
    const reporter = new InMemoryTaskProgressReporter();
    const orchestrator = new CreateOfferOrchestrator(adapter, reporter);

    await orchestrator.processTask(
      baseTask({ executionPhase: 'OFFER_SENT' }),
    );

    expect(sendSpy).not.toHaveBeenCalled();
    expect(reporter.reports).toHaveLength(0);
  });
});
