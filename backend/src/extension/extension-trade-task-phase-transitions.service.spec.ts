import { TradeTaskExecutionPhase, TradeTaskStatus } from '@prisma/client';
import { AppException } from '../common/errors/app.exception';
import { ExtensionTradeTaskService } from './extension-trade-task.service';

describe('ExtensionTradeTaskService phase transitions', () => {
  const tx = {
    tradeTaskStatusEvent: { create: jest.fn() },
    tradeTask: { update: jest.fn() },
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
    },
    order: { findUnique: jest.fn() },
    outboxEvent: { create: jest.fn() },
    $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) =>
      fn(tx),
    ),
  };
  const reconcile = { reconcile: jest.fn() };
  const disputeOps = { openSystemDispute: jest.fn() };
  const extensionFlowMetrics = { recordTaskOutcome: jest.fn() };
  const antiFraud = { recordTaskFailure: jest.fn() };
  const tradeAck = { assertOfferSentTrustGate: jest.fn().mockResolvedValue(undefined) };
  const service = new ExtensionTradeTaskService(
    prisma as never,
    reconcile as never,
    disputeOps as never,
    extensionFlowMetrics as never,
    antiFraud as never,
    tradeAck as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.tradeTaskStatusEvent.findUnique.mockResolvedValue(null);
    prisma.tradeTask.findUnique.mockResolvedValue({
      id: 'task-1',
      orderId: 'order-1',
      tradeOperationId: 'trade-1',
      status: TradeTaskStatus.DISPATCHED,
      executionPhase: TradeTaskExecutionPhase.ACKED,
      attemptCount: 1,
      maxAttempts: 5,
    });
    tx.order.findUnique.mockResolvedValue({ sellerId: 'seller-1' });
    prisma.order.findUnique.mockResolvedValue({ sellerId: 'seller-1' });
  });

  it('accepts new UI pipeline phases in order', async () => {
    const phases = [
      TradeTaskExecutionPhase.TRADE_PAGE_OPENED,
      TradeTaskExecutionPhase.OFFER_DRAFTED,
      TradeTaskExecutionPhase.ITEM_SELECTED,
      TradeTaskExecutionPhase.OFFER_SUBMITTED,
    ] as const;

    let currentPhase: TradeTaskExecutionPhase | null =
      TradeTaskExecutionPhase.ACKED;
    for (const phase of phases) {
      prisma.tradeTask.findUnique.mockResolvedValueOnce({
        id: 'task-1',
        orderId: 'order-1',
        tradeOperationId: 'trade-1',
        status: TradeTaskStatus.DISPATCHED,
        executionPhase: currentPhase,
        attemptCount: 1,
        maxAttempts: 5,
      });

      await service.reportTaskProgress({
        taskId: 'task-1',
        phase,
        idempotencyKey: `progress:task-1:${phase}`,
      });

      currentPhase = phase;
    }

    expect(tx.tradeTask.update).toHaveBeenCalledTimes(phases.length);
  });

  it('accepts OFFER_DRAFTED resume jumping to ITEM_SELECTED', async () => {
    prisma.tradeTask.findUnique.mockResolvedValue({
      id: 'task-1',
      orderId: 'order-1',
      tradeOperationId: 'trade-1',
      status: TradeTaskStatus.DISPATCHED,
      executionPhase: TradeTaskExecutionPhase.OFFER_DRAFTED,
      attemptCount: 1,
      maxAttempts: 5,
    });

    const result = await service.reportTaskProgress({
      taskId: 'task-1',
      phase: TradeTaskExecutionPhase.ITEM_SELECTED,
      idempotencyKey: 'progress:task-1:ITEM_SELECTED',
      details: { assetId: 'asset-123' },
    });

    expect(result.ok).toBe(true);
    expect(result.terminal).toBe(false);
  });

  it('rejects invalid phase regression', async () => {
    prisma.tradeTask.findUnique.mockResolvedValue({
      id: 'task-1',
      orderId: 'order-1',
      tradeOperationId: 'trade-1',
      status: TradeTaskStatus.DISPATCHED,
      executionPhase: TradeTaskExecutionPhase.OFFER_DRAFTED,
      attemptCount: 1,
      maxAttempts: 5,
    });

    await expect(
      service.reportTaskProgress({
        taskId: 'task-1',
        phase: TradeTaskExecutionPhase.ACKED,
        idempotencyKey: 'progress:task-1:ACKED:retry',
      }),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('rejects OFFER_SENT without a valid offer id', async () => {
    prisma.tradeTaskStatusEvent.findUnique.mockResolvedValue(null);
    prisma.tradeTask.findUnique.mockResolvedValue({
      id: 'task-1',
      orderId: 'order-1',
      tradeOperationId: 'trade-1',
      status: TradeTaskStatus.DISPATCHED,
      executionPhase: TradeTaskExecutionPhase.OFFER_SUBMITTED,
      attemptCount: 1,
      maxAttempts: 5,
    });

    await expect(
      service.reportTaskProgress({
        taskId: 'task-1',
        phase: TradeTaskExecutionPhase.OFFER_SENT,
        idempotencyKey: 'progress:task-1:OFFER_SENT:invalid',
        offerId: 'pending-offer',
      }),
    ).rejects.toBeInstanceOf(AppException);
    expect(reconcile.reconcile).not.toHaveBeenCalled();
  });

  it('rejects progress updates after terminal OFFER_SENT', async () => {
    prisma.tradeTask.findUnique.mockResolvedValue({
      id: 'task-1',
      orderId: 'order-1',
      tradeOperationId: 'trade-1',
      status: TradeTaskStatus.ACKED,
      executionPhase: TradeTaskExecutionPhase.OFFER_SENT,
      attemptCount: 1,
      maxAttempts: 5,
    });

    await expect(
      service.reportTaskProgress({
        taskId: 'task-1',
        phase: TradeTaskExecutionPhase.ITEM_SELECTED,
        idempotencyKey: 'progress:task-1:ITEM_SELECTED:late',
      }),
    ).rejects.toBeInstanceOf(AppException);
  });
});
