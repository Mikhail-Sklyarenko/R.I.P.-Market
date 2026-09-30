import { TradesService } from './trades.service';

describe('poll settlement authority', () => {
  it.each([
    undefined,
    { offerStatus: 'accepted', inventoryDelta: 'pending' },
    { offerStatus: 'unknown', inventoryDelta: 'confirmed' },
    { offerStatus: 'accepted', inventoryDelta: 'unknown' },
  ])(
    'rejects insufficient evidence before querying or mutating the ledger: %j',
    async (evidence) => {
      const transaction = jest.fn();
      const findFirst = jest.fn();
      const service = Object.create(TradesService.prototype) as TradesService;
      Object.assign(service, {
        prisma: { $transaction: transaction, auditLog: { findFirst } },
      });
      await expect(
        service.applyTradeConfirmedFromPoll('order', evidence),
      ).rejects.toThrow('Independent offer and inventory');
      expect(transaction).not.toHaveBeenCalled();
      expect(findFirst).not.toHaveBeenCalled();
    },
  );
});

it('confirmed server proof enters hold once without immediate seller payout', async () => {
  const order = {
    id: 'order',
    status: 'WAITING_TRADE',
    hold: { id: 'hold' },
    lot: {},
    buyer: { steamId: 'buyer' },
    seller: { steamId: 'seller' },
    tradeOperation: {
      id: 'op',
      status: 'WAITING',
      deliveryProof: { version: 2 },
    },
    createdAt: new Date(),
  };
  const tx = {
    order: { findUnique: jest.fn(async () => order) },
    auditLog: { create: jest.fn() },
  };
  const settlementService = {
    enterSettlementHold: jest.fn(async () => {
      order.status = 'SETTLEMENT_HOLD';
    }),
    settleCompletedOrder: jest.fn(),
    trySettleConfirmedOrder: jest.fn(),
  };
  const service = Object.create(TradesService.prototype) as TradesService;
  Object.assign(service, {
    prisma: {
      $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) =>
        fn(tx),
      ),
      auditLog: { findFirst: jest.fn(async () => null) },
      tradeTask: { findFirst: jest.fn(async () => null) },
    },
    settlementService,
    tradeOperationStateService: { transitionByEvent: jest.fn() },
    orderStateService: { transitionByEvent: jest.fn() },
    extensionFlowMetrics: { recordOrderCompleted: jest.fn() },
  });
  const previous = process.env.ENABLE_REAL_SETTLEMENT;
  process.env.ENABLE_REAL_SETTLEMENT = 'false';
  try {
    await service.applyTradeConfirmedFromPoll('order', {
      offerStatus: 'accepted',
      inventoryDelta: 'confirmed',
    });
    await service.applyTradeConfirmedFromPoll('order', {
      offerStatus: 'accepted',
      inventoryDelta: 'confirmed',
    });
    expect(settlementService.enterSettlementHold).toHaveBeenCalledTimes(1);
    expect(settlementService.settleCompletedOrder).not.toHaveBeenCalled();
    expect(settlementService.trySettleConfirmedOrder).not.toHaveBeenCalled();
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
  } finally {
    if (previous === undefined) delete process.env.ENABLE_REAL_SETTLEMENT;
    else process.env.ENABLE_REAL_SETTLEMENT = previous;
  }
});
