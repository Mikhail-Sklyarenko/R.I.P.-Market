import { TradeTaskStatus } from '@prisma/client';
import { ExtensionTradeTaskService } from './extension-trade-task.service';

describe('ExtensionTradeTaskService integration-like', () => {
  const prisma = {
    tradeTask: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
    outboxEvent: { create: jest.fn() },
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
    expect(prisma.tradeTask.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'task-expired' },
        data: expect.objectContaining({ status: TradeTaskStatus.EXPIRED }),
      }),
    );
    expect(prisma.outboxEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eventType: 'TRADE_TASK_EXPIRED' }),
      }),
    );
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
    expect(prisma.tradeTask.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'task-failed' },
        data: expect.objectContaining({ status: TradeTaskStatus.FAILED }),
      }),
    );
  });
});
