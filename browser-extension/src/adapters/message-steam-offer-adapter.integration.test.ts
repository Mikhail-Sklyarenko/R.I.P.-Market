import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CreateOfferOrchestrator,
  InMemoryTaskProgressReporter,
  type PolledTradeTask,
} from '@rip-market/extension-orchestrator';
import { MessageSteamOfferAdapter } from './message-steam-offer-adapter.js';
import type { SteamCommunityClient } from '../shared/steam-community-client.js';

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

function createAdapterWithInventory(): MessageSteamOfferAdapter {
  const steam = {
    resolveSessionSteamId: vi.fn().mockResolvedValue('76561198000000000'),
    loadInventory: vi.fn().mockResolvedValue([
      {
        assetId: 'asset-123',
        marketHashName: 'AK-47 | Redline (Field-Tested)',
      },
    ]),
    navigateToTradePage: vi.fn().mockResolvedValue(42),
    sendTradeOffer: vi.fn().mockResolvedValue({
      ok: true,
      offerId: '99887766',
      confirmPending: false,
    }),
  } as unknown as SteamCommunityClient;

  return new MessageSteamOfferAdapter(steam);
}

describe('CreateOfferOrchestrator with MessageSteamOfferAdapter', () => {
  beforeEach(() => {
    vi.stubGlobal('chrome', {
      storage: {
        session: {
          get: vi.fn().mockImplementation(async (key: string) => {
            if (key === 'rip:draft:draft-task-1') {
              return {
                'rip:draft:draft-task-1': {
                  buyerTradeUrl:
                    'https://steamcommunity.com/tradeoffer/new/?partner=123&token=abc',
                  item: { assetId: 'asset-123' },
                },
              };
            }
            return {};
          }),
          set: vi.fn().mockResolvedValue(undefined),
          remove: vi.fn().mockResolvedValue(undefined),
        },
      },
    });
  });

  it('reports OFFER_DRAFTED then OFFER_SENT through UI adapter path', async () => {
    const reporter = new InMemoryTaskProgressReporter();
    const adapter = createAdapterWithInventory();
    const orchestrator = new CreateOfferOrchestrator(adapter, reporter);

    await orchestrator.processTask(baseTask());

    expect(reporter.reports.map((entry) => entry.phase)).toEqual([
      'ACKED',
      'TRADE_PAGE_OPENED',
      'OFFER_DRAFTED',
      'ITEM_SELECTED',
      'OFFER_SUBMITTED',
      'OFFER_SENT',
    ]);
    expect(reporter.reports.at(-1)?.offerId).toBe('99887766');
  });

  it('resumes from OFFER_DRAFTED and sends via UI adapter path', async () => {
    const reporter = new InMemoryTaskProgressReporter();
    const adapter = createAdapterWithInventory();
    const orchestrator = new CreateOfferOrchestrator(adapter, reporter);

    await orchestrator.processTask(
      baseTask({ executionPhase: 'OFFER_DRAFTED' }),
    );

    expect(reporter.reports.map((entry) => entry.phase)).toEqual([
      'ITEM_SELECTED',
      'OFFER_SUBMITTED',
      'OFFER_SENT',
    ]);
    expect(reporter.reports.at(-1)?.offerId).toBe('99887766');
  });
});
