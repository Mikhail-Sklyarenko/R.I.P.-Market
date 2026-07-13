import { CatalogService } from './catalog.service';
import { LotStatus } from '@prisma/client';

describe('CatalogService', () => {
  const prisma = {
    itemDefinition: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
    },
    lot: {
      findMany: jest.fn(),
    },
    order: {
      findMany: jest.fn(),
    },
  };

  const steamMarketPrice = {
    getPricesMinor: jest.fn(),
    getPricesWithMeta: jest.fn(),
  };

  const service = new CatalogService(
    prisma as never,
    steamMarketPrice as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.order.findMany.mockResolvedValue([]);
    prisma.itemDefinition.count.mockResolvedValue(0);
    steamMarketPrice.getPricesMinor.mockResolvedValue({});
    steamMarketPrice.getPricesWithMeta.mockResolvedValue({});
  });

  it('returns item definitions without active lots in catalog', async () => {
    prisma.lot.findMany.mockResolvedValue([]);
    prisma.itemDefinition.count.mockResolvedValue(2);
    prisma.itemDefinition.findMany.mockResolvedValue([
      {
        id: 'item-unlisted',
        marketHashName: 'Revolution Case',
        weapon: null,
        rarity: 'Base Grade',
        iconUrl: null,
      },
      {
        id: 'item-listed',
        marketHashName: 'AK-47 | Redline (Field-Tested)',
        weapon: 'Rifle',
        rarity: 'Classified',
        iconUrl: null,
      },
    ]);
    steamMarketPrice.getPricesWithMeta.mockResolvedValue({
      'Revolution Case': { priceMinor: 350, fetchedAt: '2026-07-11T12:00:00.000Z' },
      'AK-47 | Redline (Field-Tested)': {
        priceMinor: 1250,
        fetchedAt: '2026-07-11T12:00:00.000Z',
      },
    });

    const result = await service.listItems({ page: 1, limit: 24 });

    expect(result.items).toHaveLength(2);
    expect(result.items.find((item) => item.id === 'item-unlisted')).toMatchObject({
      activeLotCount: 0,
      minMarketplacePriceMinor: null,
      featuredLotId: null,
    });
  });

  it('includes listed items with lot stats and featured lot', async () => {
    prisma.lot.findMany.mockImplementation((args: { select?: unknown; orderBy?: unknown }) => {
      if (args.orderBy) {
        return Promise.resolve([
          {
            id: 'lot-1',
            inventoryAsset: {
              itemDefinitionId: 'item-listed',
              wear: 'FT',
              floatValue: null,
              itemDefinition: {
                marketHashName: 'AK-47 | Redline (Field-Tested)',
              },
            },
            listingSnapshot: {
              wear: 'FT',
              floatValue: null,
              marketHashName: 'AK-47 | Redline (Field-Tested)',
            },
          },
        ]);
      }
      if (args.select && typeof args.select === 'object' && args.select !== null && 'priceMinor' in args.select) {
        return Promise.resolve([
          {
            priceMinor: 1000n,
            inventoryAsset: {
              itemDefinitionId: 'item-listed',
              wear: 'FT',
              floatValue: null,
            },
            listingSnapshot: {
              wear: 'FT',
              floatValue: null,
            },
          },
        ]);
      }
      return Promise.resolve([]);
    });
    prisma.itemDefinition.findMany.mockResolvedValue([
      {
        id: 'item-listed',
        marketHashName: 'AK-47 | Redline (Field-Tested)',
        weapon: 'Rifle',
        rarity: 'Classified',
        iconUrl: null,
      },
    ]);
    prisma.itemDefinition.count.mockResolvedValue(1);

    const result = await service.listItems({ page: 1, limit: 24 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: 'item-listed',
      activeLotCount: 1,
      featuredLotId: 'lot-1',
      minMarketplacePriceMinor: '1000',
    });
  });

  it('does not block catalog list on Steam price fetches', async () => {
    prisma.lot.findMany.mockResolvedValue([]);
    prisma.itemDefinition.findMany.mockResolvedValue([
      {
        id: 'item-a',
        marketHashName: 'AK-47 | Redline (Field-Tested)',
        weapon: 'Rifle',
        rarity: 'Classified',
        iconUrl: null,
      },
    ]);
    prisma.itemDefinition.count = jest.fn().mockResolvedValue(1);

    const result = await service.listItems({ page: 1, limit: 24 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.steamPriceMinor).toBeNull();
    expect(steamMarketPrice.getPricesWithMeta).not.toHaveBeenCalled();
  });

  it('returns unlisted items when weapon filter matches but no lots exist', async () => {
    prisma.lot.findMany.mockResolvedValue([]);
    prisma.itemDefinition.count.mockResolvedValue(1);
    prisma.itemDefinition.findMany.mockResolvedValue([
      {
        id: 'item-knife',
        marketHashName: '★ Karambit | Doppler (Factory New)',
        weapon: 'Knife',
        rarity: 'Covert',
        iconUrl: null,
      },
    ]);

    const result = await service.listItems({
      page: 1,
      limit: 24,
      weapon: 'Knife',
    });

    expect(prisma.itemDefinition.findMany).toHaveBeenCalled();
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.activeLotCount).toBe(0);
  });

  it('matches any other-tab item type when q contains pipe-separated terms', async () => {
    prisma.lot.findMany.mockResolvedValue([]);
    prisma.itemDefinition.findMany.mockResolvedValue([]);

    await service.listItems({
      page: 1,
      limit: 24,
      q: 'Sticker|Charm|Patch',
    });

    expect(prisma.itemDefinition.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          game: 'CS2',
          OR: [
            { marketHashName: { contains: 'Sticker', mode: 'insensitive' } },
            { marketHashName: { contains: 'Charm', mode: 'insensitive' } },
            { marketHashName: { contains: 'Patch', mode: 'insensitive' } },
          ],
        }),
      }),
    );
  });
});
