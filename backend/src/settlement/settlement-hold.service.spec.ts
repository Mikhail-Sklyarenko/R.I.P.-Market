import { OrderStatus } from '@prisma/client';
import { SettlementService } from './settlement.service';

describe('SettlementService hold window', () => {
  const baseOrder = {
    id: 'order-1',
    buyerId: 'buyer-1',
    sellerId: 'seller-1',
    status: OrderStatus.TRADE_CONFIRMED,
    amountMinor: 100_000n,
    lotId: 'lot-1',
    buyer: { steamId: 'buyer-steam' },
    seller: { steamId: 'seller-steam' },
    hold: {
      id: 'hold-1',
      amountMinor: 100_000n,
      capturedMinor: 0n,
      releasedMinor: 0n,
      settlementHoldUntil: null,
      settlementReleasedAt: null,
    },
    lot: {
      status: 'RESERVED',
      sellerReceiveMinor: 95_000n,
      commissionMinor: 5_000n,
      inventoryAssetId: 'asset-1',
    },
    tradeOperation: { status: 'DELIVERY_VERIFIED' },
  };

  function buildService() {
    const tx = {
      auditLog: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
      hold: { update: jest.fn().mockResolvedValue({}) },
      outboxEvent: { create: jest.fn(), findFirst: jest.fn().mockResolvedValue(null) },
      inventoryAsset: { update: jest.fn() },
      settlementDailyStats: { upsert: jest.fn() },
      order: { findUnique: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
      auditLog: { findFirst: jest.fn().mockResolvedValue(null) },
      order: { findUnique: jest.fn() },
    };
    const ledgerService = {
      settleSale: jest.fn().mockResolvedValue({ referenceGroupId: 'rg-1', entries: [] }),
      refundHold: jest.fn().mockResolvedValue({ referenceGroupId: 'rg-2', entries: [] }),
    };
    const lotStateService = { transition: jest.fn() };
    const orderStateService = { transitionByEvent: jest.fn() };
    const guard = {
      canSettle: jest.fn().mockResolvedValue({ allowed: true }),
    };
    const service = new SettlementService(
      prisma as never,
      ledgerService as never,
      lotStateService as never,
      orderStateService as never,
      guard as never,
    );
    return {
      service,
      tx,
      prisma,
      ledgerService,
      lotStateService,
      orderStateService,
      guard,
    };
  }

  beforeEach(() => {
    process.env.ENABLE_SETTLEMENT_HOLD_WINDOW = 'true';
    process.env.ENABLE_EXTENSION_FIRST_TRADE_FLOW = 'true';
    process.env.SETTLEMENT_HOLD_DAYS = '8';
  });

  afterEach(() => {
    delete process.env.ENABLE_SETTLEMENT_HOLD_WINDOW;
    delete process.env.ENABLE_EXTENSION_FIRST_TRADE_FLOW;
    delete process.env.SETTLEMENT_HOLD_DAYS;
  });

  it('enters settlement hold without ledger release', async () => {
    const { service, prisma, ledgerService, orderStateService, tx } = buildService();
    prisma.order.findUnique.mockResolvedValue(baseOrder);
    tx.order.findUnique.mockResolvedValue(baseOrder);

    const result = await service.trySettleConfirmedOrder(
      'order-1',
      'trade-success:key-1',
    );

    expect(result.inHold).toBe(true);
    expect(result.settled).toBe(false);
    expect(ledgerService.settleSale).not.toHaveBeenCalled();
    expect(orderStateService.transitionByEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        event: 'SETTLEMENT_STARTED',
        from: OrderStatus.TRADE_CONFIRMED,
      }),
    );
  });

  it('releases hold once when due and is idempotent on duplicate run', async () => {
    const { service, prisma, ledgerService, tx } = buildService();
    const dueHold = {
      ...baseOrder,
      status: OrderStatus.SETTLEMENT_HOLD,
      hold: {
        ...baseOrder.hold,
        settlementHoldUntil: new Date(Date.now() - 60_000),
        settlementReleasedAt: null,
      },
    };
    prisma.order.findUnique.mockResolvedValue(dueHold);
    tx.order.findUnique.mockResolvedValue(dueHold);

    const first = await service.releaseDueSettlementHold('order-1');
    expect(first.settled).toBe(true);
    expect(ledgerService.settleSale).toHaveBeenCalledTimes(1);

    tx.auditLog.findFirst.mockImplementation(async ({ where }: { where: { action?: string } }) =>
      where.action === 'SETTLEMENT_HOLD_RELEASED' ? { id: 'audit-1' } : null,
    );
    prisma.order.findUnique.mockResolvedValue({
      ...dueHold,
      hold: {
        ...dueHold.hold,
        settlementReleasedAt: new Date(),
        capturedMinor: dueHold.hold.amountMinor,
      },
    });

    const second = await service.releaseDueSettlementHold('order-1');
    expect(second.settled).toBe(true);
    expect(ledgerService.settleSale).toHaveBeenCalledTimes(1);
  });

  it('reverses hold with refund before release', async () => {
    const { service, prisma, ledgerService, orderStateService, tx } = buildService();
    const heldOrder = {
      ...baseOrder,
      status: OrderStatus.SETTLEMENT_HOLD,
      hold: {
        ...baseOrder.hold,
        settlementHoldUntil: new Date(Date.now() + 60_000),
      },
    };
    prisma.order.findUnique.mockResolvedValue(heldOrder);
    tx.order.findUnique.mockResolvedValue(heldOrder);

    await service.reverseSettlementHold(
      'order-1',
      'STEAM_REVERSAL_SIGNAL',
      'settlement-hold-reverse:order-1',
    );

    expect(ledgerService.refundHold).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'order-1',
        amountMinor: 100_000n,
        idempotencyKey: 'settlement-hold-reverse:order-1',
      }),
    );
    expect(orderStateService.transitionByEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        event: 'SETTLEMENT_REVERSED',
        from: OrderStatus.SETTLEMENT_HOLD,
      }),
    );
  });
});
