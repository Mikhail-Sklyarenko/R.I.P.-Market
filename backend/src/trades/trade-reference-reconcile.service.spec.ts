import {
  LotStatus,
  OrderStatus,
  TradeOperationStatus,
} from '@prisma/client';
import { TradeReferenceReconcileService } from './trade-reference-reconcile.service';

describe('TradeReferenceReconcileService', () => {
  const prisma = {
    auditLog: { findFirst: jest.fn(), create: jest.fn() },
    order: { findUnique: jest.fn() },
    tradeOperation: { update: jest.fn(), findFirst: jest.fn() },
    outboxEvent: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  const orderStateService = { transitionByEvent: jest.fn() };
  const lotStateService = { transition: jest.fn() };
  const service = new TradeReferenceReconcileService(
    prisma as never,
    orderStateService as never,
    lotStateService as never,
  );

  const baseOrder = {
    id: 'order-1',
    sellerId: 'seller-1',
    buyerId: 'buyer-1',
    lotId: 'lot-1',
    status: OrderStatus.WAITING_TRADE,
    tradeOperation: {
      id: 'trade-1',
      externalOfferId: null,
    },
    lot: {
      status: LotStatus.RESERVED,
      inventoryAssetId: 'inv-1',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.ENABLE_TRADE_REFERENCE_RECONCILE;
    prisma.auditLog.findFirst.mockResolvedValue(null);
    prisma.order.findUnique.mockResolvedValue(baseOrder);
    prisma.tradeOperation.update.mockResolvedValue({});
    prisma.outboxEvent.create.mockResolvedValue({});
    prisma.auditLog.create.mockResolvedValue({});
    prisma.$transaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          order: { findUnique: jest.fn().mockResolvedValue(baseOrder) },
          tradeOperation: { update: jest.fn() },
          auditLog: { create: jest.fn() },
          outboxEvent: { create: jest.fn() },
          inventoryAsset: { update: jest.fn() },
        }),
    );
  });

  it('applies valid offer id and writes audit/outbox', async () => {
    const result = await service.reconcile({
      orderId: 'order-1',
      sellerId: 'seller-1',
      offerId: '8301234567',
      idempotencyKey: 'idem-1',
      source: 'MANUAL',
    });

    expect(result).toEqual({
      orderId: 'order-1',
      externalOfferId: '8301234567',
      applied: true,
      idempotent: false,
      disputed: false,
    });
    expect(prisma.tradeOperation.update).toHaveBeenCalledWith({
      where: { id: 'trade-1' },
      data: { externalOfferId: '8301234567' },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'TRADE_REFERENCE_RECONCILED',
          idempotencyKey: 'idem-1',
        }),
      }),
    );
  });

  it('returns idempotent when audit idempotency key already exists', async () => {
    prisma.auditLog.findFirst.mockResolvedValue({ id: 'audit-1' });

    const result = await service.reconcile({
      orderId: 'order-1',
      sellerId: 'seller-1',
      offerId: '8301234567',
      idempotencyKey: 'idem-dup',
      source: 'EXTENSION',
    });

    expect(result.idempotent).toBe(true);
    expect(result.applied).toBe(false);
    expect(prisma.tradeOperation.update).not.toHaveBeenCalled();
  });

  it('opens dispute on spoof when strict reconcile is enabled', async () => {
    process.env.ENABLE_TRADE_REFERENCE_RECONCILE = 'true';
    prisma.tradeOperation.findFirst.mockResolvedValue({ orderId: 'order-other' });

    const result = await service.reconcile({
      orderId: 'order-1',
      sellerId: 'seller-1',
      offerId: '8309999999',
      idempotencyKey: 'idem-spoof',
      source: 'EXTENSION',
    });

    expect(result.disputed).toBe(true);
    expect(result.applied).toBe(false);
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.tradeOperation.update).not.toHaveBeenCalled();
  });

  it('opens dispute on mismatch when strict reconcile is enabled', async () => {
    process.env.ENABLE_TRADE_REFERENCE_RECONCILE = 'true';
    prisma.order.findUnique.mockResolvedValue({
      ...baseOrder,
      tradeOperation: {
        id: 'trade-1',
        externalOfferId: '8301111111',
      },
    });
    prisma.tradeOperation.findFirst.mockResolvedValue(null);

    const result = await service.reconcile({
      orderId: 'order-1',
      sellerId: 'seller-1',
      offerId: '8302222222',
      idempotencyKey: 'idem-mismatch',
      source: 'MANUAL',
    });

    expect(result.disputed).toBe(true);
    expect(prisma.tradeOperation.update).not.toHaveBeenCalled();
  });

  it('rejects invalid seller with ORDER_NOT_FOUND', async () => {
    await expect(
      service.reconcile({
        orderId: 'order-1',
        sellerId: 'wrong-seller',
        offerId: '8301234567',
        source: 'MANUAL',
      }),
    ).rejects.toMatchObject({
      code: 'ORDER_NOT_FOUND',
    });
  });
});
