import { TradeTaskStatus } from '@prisma/client';
import { ExtensionTradeTaskService } from './extension-trade-task.service';

describe('ExtensionTradeTaskService integration-like', () => {
  const prisma = {
    tradeTask: {
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    outboxEvent: { create: jest.fn() },
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(prisma),
    ),
  };
  const reconcile = { reconcile: jest.fn() };
  const disputeOps = { openSystemDispute: jest.fn() };
  const extensionFlowMetrics = { recordTaskOutcome: jest.fn() };
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

  it('expires ttl-passed tasks and emits outbox alert', async () => {
    prisma.tradeTask.findMany.mockResolvedValue([
      {
        id: 'task-expired',
        orderId: 'order-1',
        tradeOperationId: 'trade-1',
        status: TradeTaskStatus.DISPATCHED,
      },
    ]);
    const count = await service.expireTasks();
    expect(count).toBe(1);
    expect(prisma.tradeTask.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'task-expired',
          status: TradeTaskStatus.DISPATCHED,
        }),
        data: expect.objectContaining({ status: TradeTaskStatus.EXPIRED }),
      }),
    );
    expect(prisma.outboxEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eventType: 'TRADE_TASK_EXPIRED' }),
      }),
    );
  });

  it('does not expire a task changed since the sweep read or emit a false alert', async () => {
    prisma.tradeTask.findMany.mockResolvedValue([
      { id: 'race', status: TradeTaskStatus.DISPATCHED },
    ]);
    prisma.tradeTask.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await service.expireTasks()).toBe(0);
    expect(prisma.outboxEvent.create).not.toHaveBeenCalled();
  });

  it('fails tasks when retry limit reached', async () => {
    prisma.tradeTask.findMany.mockResolvedValue([
      {
        id: 'task-failed',
        orderId: 'order-2',
        tradeOperationId: 'trade-2',
        attemptCount: 5,
        status: TradeTaskStatus.DISPATCHED,
      },
    ]);
    const count = await service.failOverRetriedTasks();
    expect(count).toBe(1);
    expect(prisma.tradeTask.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'task-failed',
          status: TradeTaskStatus.DISPATCHED,
        }),
        data: expect.objectContaining({ status: TradeTaskStatus.FAILED }),
      }),
    );
  });
});
