import { OrderStatus } from '@prisma/client';
import { DisputeOpsService } from './dispute-ops.service';

describe('DisputeOpsService', () => {
  const prisma = {
    order: { findUnique: jest.fn() },
    orderStatusEvent: { findMany: jest.fn().mockResolvedValue([]) },
    lotStatusEvent: { findMany: jest.fn().mockResolvedValue([]) },
    tradeOperationStatusEvent: { findMany: jest.fn().mockResolvedValue([]) },
    auditLog: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
    },
    outboxEvent: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
    tradePollEvent: { findMany: jest.fn().mockResolvedValue([]) },
    tradeTask: { findMany: jest.fn().mockResolvedValue([]) },
    tradeVerificationSnapshot: { findMany: jest.fn().mockResolvedValue([]) },
    tradeOperation: { update: jest.fn() },
    inventoryAsset: { update: jest.fn() },
    $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
  };
  const orderStateService = { transition: jest.fn() };
  const lotStateService = { transition: jest.fn() };
  const extensionFlowMetrics = {
    recordOrderDisputed: jest.fn(),
  };
  const antiFraud = { recordDisputeOpened: jest.fn() };
  const service = new DisputeOpsService(
    prisma as never,
    orderStateService as never,
    lotStateService as never,
    extensionFlowMetrics as never,
    antiFraud as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('opens system dispute with audit and outbox', async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      status: OrderStatus.WAITING_TRADE,
      lotId: 'lot-1',
      sellerId: 'seller-1',
      buyerId: 'buyer-1',
      lot: { status: 'RESERVED', inventoryAssetId: 'asset-1' },
      tradeOperation: { id: 'trade-1', status: 'WAITING' },
    });

    const opened = await service.openSystemDispute({
      orderId: 'order-1',
      reasonCode: 'TRADE_REFERENCE_SPOOF',
      source: 'RECONCILE',
      idempotencyKey: 'idem-1',
    });

    expect(opened).toBe(true);
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'SYSTEM_DISPUTE_OPENED',
          idempotencyKey: 'idem-1',
        }),
      }),
    );
    expect(prisma.outboxEvent.create).toHaveBeenCalled();
  });

  it('is idempotent for duplicate system dispute key', async () => {
    prisma.auditLog.findFirst.mockResolvedValue({ id: 'audit-1' });
    const opened = await service.openSystemDispute({
      orderId: 'order-1',
      reasonCode: 'TRADE_REFERENCE_SPOOF',
      source: 'RECONCILE',
      idempotencyKey: 'idem-dup',
    });
    expect(opened).toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
