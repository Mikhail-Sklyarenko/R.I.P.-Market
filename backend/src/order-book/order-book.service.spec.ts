import { OrderBookService } from './order-book.service';

describe('OrderBookService', () => {
  const prisma = {
    buyRequest: { findMany: jest.fn() },
    lot: {
      count: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    itemDefinition: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
  };

  const service = new OrderBookService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns aggregated bids and ask preview for a catalog item', async () => {
    prisma.itemDefinition.findUnique.mockResolvedValue({
      id: 'item-base',
      marketHashName: 'AK-47 | Redline',
      baseMarketHashName: 'AK-47 | Redline',
      catalogSeeded: true,
      weapon: 'Rifle',
      rarity: 'Classified',
      iconUrl: null,
      availableWears: ['FN', 'MW'],
    });
    prisma.itemDefinition.findMany.mockResolvedValue([
      { id: 'item-base' },
      { id: 'item-fn' },
    ]);
    prisma.buyRequest.findMany.mockResolvedValue([
      { maxPriceMinor: 1200n, quantity: 2, quantityFilled: 0 },
      { maxPriceMinor: 1100n, quantity: 1, quantityFilled: 0 },
    ]);
    prisma.lot.count.mockResolvedValue(2);
    prisma.lot.findFirst.mockResolvedValue({ priceMinor: 1300n });
    prisma.lot.findMany.mockResolvedValue([
      {
        id: 'lot-1',
        priceMinor: 1300n,
        listingSnapshot: { floatValue: 0.12, wear: 'MW' },
        inventoryAsset: { floatValue: 0.12, wear: 'MW' },
      },
    ]);

    const result = await service.getForItem('ak-47-redline');

    expect(result.bids).toEqual([
      { priceMinor: '1200', quantity: 2 },
      { priceMinor: '1100', quantity: 1 },
    ]);
    expect(result.asks).toHaveLength(1);
    expect(result.asksSummary.count).toBe(2);
    expect(result.bestBidMinor).toBe('1200');
    expect(result.bestAskMinor).toBe('1300');
  });
});
