import { TradeTaskExecutionPhase, TradeTaskStatus } from '@prisma/client';
import { ExtensionTradeTaskService } from './extension-trade-task.service';

describe('ExtensionTradeTaskService', () => {
  const prisma = {
    tradeTask: {
      upsert: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
    },
    tradeTaskStatusEvent: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    tradeOperation: { update: jest.fn() },
    order: { findUnique: jest.fn() },
    extensionSession: {
      findUnique: jest.fn(),
    },
    outboxEvent: { create: jest.fn() },
    $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        tradeTaskStatusEvent: { create: jest.fn() },
        tradeTask: { update: jest.fn() },
        tradeOperation: { update: jest.fn() },
        outboxEvent: { create: jest.fn() },
      }),
    ),
  };
  const reconcile = { reconcile: jest.fn() };
  const disputeOps = { openSystemDispute: jest.fn() };
  const extensionFlowMetrics = {
    recordOrderStarted: jest.fn(),
    recordTaskOutcome: jest.fn(),
  };
  const antiFraud = { recordTaskFailure: jest.fn() };
  const tradeAck = {
    assertOfferSentTrustGate: jest.fn().mockResolvedValue(undefined),
  };
  const tradeStatusPoller = {
    pollOrderById: jest.fn().mockResolvedValue(false),
  };
  const service = new ExtensionTradeTaskService(
    prisma as never,
    reconcile as never,
    disputeOps as never,
    extensionFlowMetrics as never,
    antiFraud as never,
    tradeAck as never,
    tradeStatusPoller as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates create_offer task with dedup upsert', async () => {
    const previous = process.env.ENABLE_EXTENSION_UI_TRADE_FLOW;
    process.env.ENABLE_EXTENSION_UI_TRADE_FLOW = 'true';
    await service.createOfferTask({
      orderId: 'order-1',
      tradeOperationId: 'trade-1',
      sellerId: 'seller-1',
      buyerId: 'buyer-1',
      expectedAssetId: 'asset-123',
      marketHashName: 'AK-47 | Redline (Field-Tested)',
      buyerTradeUrl:
        'https://steamcommunity.com/tradeoffer/new/?partner=1&token=x',
      inventoryAssetId: 'inv-1',
    });
    expect(prisma.tradeTask.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          orderId_dedupKey: {
            orderId: 'order-1',
            dedupKey: 'create_offer:trade-1',
          },
        },
        create: expect.objectContaining({
          payload: expect.objectContaining({
            uiTradeFlow: true,
          }),
        }),
      }),
    );
    if (previous === undefined) {
      delete process.env.ENABLE_EXTENSION_UI_TRADE_FLOW;
    } else {
      process.env.ENABLE_EXTENSION_UI_TRADE_FLOW = previous;
    }
  });

  it('re-reconciles offer on idempotent OFFER_SENT retry when still unlinked', async () => {
    prisma.tradeTaskStatusEvent.findUnique.mockResolvedValue({
      phase: TradeTaskExecutionPhase.OFFER_SENT,
    });
    prisma.tradeTask.findUnique.mockResolvedValue({
      id: 'task-1',
      orderId: 'order-1',
      status: TradeTaskStatus.ACKED,
      executionPhase: TradeTaskExecutionPhase.OFFER_SENT,
      tradeOperationId: 'trade-1',
      attemptCount: 0,
      maxAttempts: 5,
    });
    prisma.order.findUnique.mockResolvedValue({
      sellerId: 'seller-1',
      tradeOperation: { externalOfferId: null },
    });

    const result = await service.reportTaskProgress({
      taskId: 'task-1',
      phase: TradeTaskExecutionPhase.OFFER_SENT,
      idempotencyKey: 'progress:task-1:OFFER_SENT',
      offerId: '9336569013',
    });

    expect(result.phase).toBe(TradeTaskExecutionPhase.OFFER_SENT);
    expect(reconcile.reconcile).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'order-1',
        sellerId: 'seller-1',
        offerId: '9336569013',
      }),
    );
  });

  it('nack keeps task for retry before max attempts', async () => {
    prisma.tradeTask.findUnique.mockResolvedValue({
      id: 'task-2',
      status: TradeTaskStatus.DISPATCHED,
      attemptCount: 1,
      maxAttempts: 5,
    });
    await service.nackTask('task-2', 'EXT_ERR');
    expect(prisma.tradeTask.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: TradeTaskStatus.DISPATCHED,
          lastErrorCode: 'EXT_ERR',
        }),
      }),
    );
  });
});
