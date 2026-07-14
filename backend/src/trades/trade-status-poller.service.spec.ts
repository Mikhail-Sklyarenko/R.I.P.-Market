import { TradeStatusPollerService } from './trade-status-poller.service';
import { TradesService } from './trades.service';

describe('TradeStatusPollerService', () => {
  function buildPoller(deps: {
    operations?: unknown[];
    singleOperation?: unknown;
    evaluation: {
      decision: {
        action: string;
        pollOutcome: string;
        reasonCode: string;
        reason?: string;
      };
      offerStatus: string | null;
      inventoryDelta: string | null;
      evidence: Record<string, unknown>;
    };
    tradesService?: Record<string, jest.Mock>;
  }) {
    const prisma = {
      tradeOperation: {
        findMany: jest.fn().mockResolvedValue(deps.operations ?? []),
        findFirst: jest.fn().mockResolvedValue(deps.singleOperation ?? null),
        update: jest.fn().mockResolvedValue({}),
      },
      tradePollEvent: {
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const deliveryEngine = {
      isInBackoff: jest.fn().mockReturnValue(false),
      evaluate: jest.fn().mockResolvedValue(deps.evaluation),
      registerRateLimitBackoff: jest.fn().mockReturnValue(120_000),
      clearBackoff: jest.fn(),
    };
    const tradesService = {
      applyTradeTimeout: jest.fn().mockResolvedValue({}),
      applyTradeConfirmedFromPoll: jest.fn().mockResolvedValue({}),
      applyTradeFailedFromPoll: jest.fn().mockResolvedValue({}),
      applyUnknownTradeStateFromPoll: jest.fn().mockResolvedValue({}),
      ...deps.tradesService,
    };
    const shadowComparator = { recordSnapshot: jest.fn() };
    const extensionFlowMetrics = { recordVerifyMismatch: jest.fn() };
    const poller = new TradeStatusPollerService(
      prisma as never,
      tradesService as unknown as TradesService,
      deliveryEngine as never,
      shadowComparator as never,
      extensionFlowMetrics as never,
    );
    return { poller, prisma, deliveryEngine, tradesService, shadowComparator };
  }

  const baseOperation = {
    id: 'trade-1',
    orderId: 'order-1',
    externalOfferId: '8301234567',
    expectedAssetId: 'asset-1',
    verificationMode: 'STEAM_POLL',
    checkCount: 1,
    order: {
      id: 'order-1',
      buyerId: 'buyer-1',
      sellerId: 'seller-1',
      createdAt: new Date(),
      lot: {
        listingSnapshot: null,
        inventoryAsset: {
          assetExternalId: 'asset-1',
          floatValue: null,
          paintSeed: null,
          itemDefinition: { marketHashName: 'AK-47 | Redline (Field-Tested)' },
        },
      },
      buyer: { id: 'buyer-1', steamId: 'buyer-steam' },
      seller: { id: 'seller-1', steamId: 'seller-steam' },
    },
  };

  it('transitions to timeout when decision is TIMEOUT', async () => {
    const { poller, tradesService } = buildPoller({
      operations: [
        {
          ...baseOperation,
          order: {
            ...baseOperation.order,
            createdAt: new Date(Date.now() - 2 * 60 * 60_000),
          },
        },
      ],
      evaluation: {
        decision: {
          action: 'TIMEOUT',
          pollOutcome: 'TIMEOUT',
          reasonCode: 'TRADE_TIMEOUT',
        },
        offerStatus: null,
        inventoryDelta: null,
        evidence: {},
      },
    });

    const result = await poller.pollWaitingTrades();

    expect(result.transitions).toBe(1);
    expect(tradesService.applyTradeTimeout).toHaveBeenCalledWith('order-1', {
      idempotencyKey: 'poll-timeout:order-1',
      auditAction: 'TRADE_POLL_TIMEOUT',
    });
  });

  it('confirms trade when dual-signal decision is CONFIRM', async () => {
    const evidence = {
      offerStatus: 'accepted',
      inventoryDelta: 'confirmed',
      reasonCode: 'DUAL_SIGNAL_CONFIRMED',
      engineEnabled: true,
    };
    const { poller, tradesService } = buildPoller({
      operations: [baseOperation],
      evaluation: {
        decision: {
          action: 'CONFIRM',
          pollOutcome: 'CONFIRMED',
          reasonCode: 'DUAL_SIGNAL_CONFIRMED',
        },
        offerStatus: 'accepted',
        inventoryDelta: 'confirmed',
        evidence,
      },
    });

    const result = await poller.pollWaitingTrades();

    expect(result.transitions).toBe(1);
    expect(tradesService.applyTradeConfirmedFromPoll).toHaveBeenCalledWith(
      'order-1',
      evidence,
    );
  });

  it('opens dispute on accepted+inventory mismatch', async () => {
    const { poller, tradesService } = buildPoller({
      operations: [baseOperation],
      evaluation: {
        decision: {
          action: 'DISPUTE',
          pollOutcome: 'FAILED_DISPUTE',
          reasonCode: 'DELIVERY_INVENTORY_MISMATCH',
          reason: 'DELIVERY_INVENTORY_MISMATCH',
        },
        offerStatus: 'accepted',
        inventoryDelta: 'seller_still_holds',
        evidence: {},
      },
    });

    const result = await poller.pollWaitingTrades();

    expect(result.transitions).toBe(1);
    expect(tradesService.applyTradeFailedFromPoll).toHaveBeenCalledWith(
      'order-1',
      'DELIVERY_INVENTORY_MISMATCH',
    );
  });

  it('does not transition on rate-limit backoff', async () => {
    const { poller, tradesService, deliveryEngine } = buildPoller({
      operations: [baseOperation],
      evaluation: {
        decision: {
          action: 'BACKOFF',
          pollOutcome: 'BACKOFF',
          reasonCode: 'RATE_LIMITED',
        },
        offerStatus: null,
        inventoryDelta: null,
        evidence: {},
      },
    });

    const result = await poller.pollWaitingTrades();

    expect(result.transitions).toBe(0);
    expect(deliveryEngine.registerRateLimitBackoff).toHaveBeenCalledWith(
      'order-1',
    );
    expect(tradesService.applyTradeConfirmedFromPoll).not.toHaveBeenCalled();
  });

  it('polls a single order immediately by id', async () => {
    const previousTradeProvider = process.env.TRADE_PROVIDER;
    process.env.TRADE_PROVIDER = 'steam';
    const evidence = {
      offerStatus: 'accepted',
      inventoryDelta: 'confirmed',
      reasonCode: 'DUAL_SIGNAL_CONFIRMED',
      engineEnabled: true,
    };
    const { poller, tradesService } = buildPoller({
      singleOperation: baseOperation,
      evaluation: {
        decision: {
          action: 'CONFIRM',
          pollOutcome: 'CONFIRMED',
          reasonCode: 'DUAL_SIGNAL_CONFIRMED',
        },
        offerStatus: 'accepted',
        inventoryDelta: 'confirmed',
        evidence,
      },
    });

    const transitioned = await poller.pollOrderById('order-1');

    expect(transitioned).toBe(true);
    expect(tradesService.applyTradeConfirmedFromPoll).toHaveBeenCalledWith(
      'order-1',
      evidence,
    );
    process.env.TRADE_PROVIDER = previousTradeProvider;
  });

  it('force poll clears backoff and still checks the order', async () => {
    const { poller, deliveryEngine, tradesService } = buildPoller({
      singleOperation: baseOperation,
      evaluation: {
        decision: {
          action: 'WAIT',
          pollOutcome: 'WAITING',
          reasonCode: 'OFFER_PENDING',
        },
        offerStatus: 'active',
        inventoryDelta: 'pending',
        evidence: {},
      },
    });
    deliveryEngine.isInBackoff.mockReturnValue(true);

    const skipped = await poller.pollOrderById('order-1');
    expect(skipped).toBe(false);
    expect(deliveryEngine.clearBackoff).not.toHaveBeenCalled();
    expect(deliveryEngine.evaluate).not.toHaveBeenCalled();

    const forced = await poller.pollOrderById('order-1', { force: true });
    expect(forced).toBe(false);
    expect(deliveryEngine.clearBackoff).toHaveBeenCalledWith('order-1');
    expect(deliveryEngine.evaluate).toHaveBeenCalled();
    expect(tradesService.applyTradeConfirmedFromPoll).not.toHaveBeenCalled();
  });
});
