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
