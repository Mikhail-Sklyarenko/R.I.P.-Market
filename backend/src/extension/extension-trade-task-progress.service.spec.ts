import { TradeTaskExecutionPhase, TradeTaskStatus } from '@prisma/client';
import { ExtensionTradeTaskService } from './extension-trade-task.service';

describe('ExtensionTradeTaskService progress', () => {
  const tx = {
    tradeTaskStatusEvent: { create: jest.fn() },
    tradeTask: { update: jest.fn() },
    tradeOperation: { update: jest.fn() },
    order: { findUnique: jest.fn() },
    outboxEvent: { create: jest.fn() },
  };
  const prisma = {
    tradeTask: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    tradeTaskStatusEvent: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    tradeOperation: { update: jest.fn() },
    order: { findUnique: jest.fn() },
    outboxEvent: { create: jest.fn() },
    $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<void>) =>
      fn(tx),
    ),
  };
  const reconcile = { reconcile: jest.fn() };
  const disputeOps = { openSystemDispute: jest.fn() };
  const extensionFlowMetrics = {
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

  it('reports OFFER_SENT idempotently and updates trade operation', async () => {
    prisma.tradeTaskStatusEvent.findUnique.mockResolvedValue(null);
    prisma.tradeTask.findUnique.mockResolvedValue({
      id: 'task-1',
      orderId: 'order-1',
      tradeOperationId: 'trade-1',
      status: TradeTaskStatus.DISPATCHED,
      executionPhase: TradeTaskExecutionPhase.OFFER_DRAFTED,
      attemptCount: 1,
      maxAttempts: 5,
    });
    tx.order.findUnique.mockResolvedValue({ sellerId: 'seller-1' });
    prisma.order.findUnique.mockResolvedValue({ sellerId: 'seller-1' });

    const result = await service.reportTaskProgress({
      taskId: 'task-1',
      phase: TradeTaskExecutionPhase.OFFER_SENT,
      idempotencyKey: 'progress:task-1:OFFER_SENT',
      offerId: '999001',
      details: {
        observedAssetId: 'asset-1',
        observedFloatValue: '0.25',
      },
    });

    expect(result.terminal).toBe(true);
    expect(tradeAck.assertOfferSentTrustGate).toHaveBeenCalledWith(
      expect.objectContaining({
        sellerId: 'seller-1',
        orderId: 'order-1',
        offerId: '999001',
        observed: { assetId: 'asset-1', floatValue: '0.25' },
      }),
    );
    expect(reconcile.reconcile).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'order-1',
        sellerId: 'seller-1',
        offerId: '999001',
        source: 'EXTENSION',
      }),
    );
  });

  it('returns cached result for duplicate idempotency key', async () => {
    prisma.tradeTaskStatusEvent.findUnique.mockResolvedValue({
      phase: TradeTaskExecutionPhase.OFFER_SENT,
    });

    const result = await service.reportTaskProgress({
      taskId: 'task-1',
      phase: TradeTaskExecutionPhase.OFFER_SENT,
      idempotencyKey: 'progress:task-1:OFFER_SENT',
    });

    expect(result.terminal).toBe(true);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('stops send retries and triggers delivery check when item gone after CONFIRM_PENDING', async () => {
    prisma.tradeTaskStatusEvent.findUnique.mockResolvedValue(null);
    prisma.tradeTask.findUnique.mockResolvedValue({
      id: 'task-2',
      orderId: 'order-2',
      tradeOperationId: 'trade-2',
      status: TradeTaskStatus.ACKED,
      executionPhase: TradeTaskExecutionPhase.CONFIRM_PENDING,
      attemptCount: 1,
      maxAttempts: 5,
    });
    prisma.order.findUnique.mockResolvedValue({ sellerId: 'seller-2' });

    const result = await service.reportTaskProgress({
      taskId: 'task-2',
      phase: TradeTaskExecutionPhase.OFFER_FAILED,
      idempotencyKey: 'progress:task-2:OFFER_FAILED:missing',
      reasonCode: 'ITEM_MISSING',
    });

    expect(result.terminal).toBe(true);
    expect(tx.tradeTask.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: TradeTaskStatus.FAILED,
          executionPhase: TradeTaskExecutionPhase.OFFER_FAILED,
          lastErrorCode: 'ITEM_ALREADY_GONE',
          nextAttemptAt: null,
        }),
      }),
    );
    expect(tradeStatusPoller.pollOrderById).toHaveBeenCalledWith('order-2');
    expect(disputeOps.openSystemDispute).not.toHaveBeenCalled();
  });
});
