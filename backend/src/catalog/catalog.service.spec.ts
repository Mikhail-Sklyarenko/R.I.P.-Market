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

  const itemIcons = {
    scheduleMissingIconRefresh: jest.fn(),
    backfillFromListingSnapshots: jest.fn().mockResolvedValue(0),
  };

  const service = new CatalogService(
    prisma as never,
    steamMarketPrice as never,
    itemIcons as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.order.findMany.mockResolvedValue([]);
    prisma.itemDefinition.count.mockResolvedValue(0);
    steamMarketPrice.getPricesMinor.mockResolvedValue({});
    steamMarketPrice.getPricesWithMeta.mockResolvedValue({});
  });

  it('returns seeded catalog cards without active lots', async () => {
    prisma.lot.findMany.mockResolvedValue([]);
    prisma.itemDefinition.count.mockResolvedValue(2);
    prisma.itemDefinition.findMany.mockResolvedValue([
      {
        id: 'item-unlisted',
        marketHashName: 'Revolution Case',
        baseMarketHashName: 'Revolution Case',
        weapon: null,
        rarity: 'Base Grade',
        iconUrl: null,
        availableWears: [],
        catalogSeeded: true,
      },
      {
        id: 'item-listed',
        marketHashName: 'AK-47 | Redline',
        baseMarketHashName: 'AK-47 | Redline',
        weapon: 'Rifle',
        rarity: 'Classified',
        iconUrl: null,
        availableWears: ['FT', 'MW'],
        catalogSeeded: true,
      },
    ]);
    steamMarketPrice.getPricesWithMeta.mockResolvedValue({
      'Revolution Case': { priceMinor: 350, fetchedAt: '2026-07-11T12:00:00.000Z' },
      'AK-47 | Redline': {
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
      catalogSeeded: true,
    });
  });

  it('aggregates wear-variant lots onto the seeded base skin card', async () => {
    prisma.lot.findMany.mockImplementation((args: { select?: unknown; orderBy?: unknown }) => {
      if (args.orderBy) {
        return Promise.resolve([
          {
            id: 'lot-1',
            inventoryAsset: {
              itemDefinitionId: 'item-wear-ft',
              wear: 'FT',
              floatValue: null,
              itemDefinition: {
                marketHashName: 'AK-47 | Redline (Field-Tested)',
                baseMarketHashName: 'AK-47 | Redline',
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
              itemDefinitionId: 'item-wear-ft',
              wear: 'FT',
              floatValue: null,
              itemDefinition: {
                marketHashName: 'AK-47 | Redline (Field-Tested)',
                baseMarketHashName: 'AK-47 | Redline',
              },
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
        id: 'item-seeded',
        marketHashName: 'AK-47 | Redline',
        baseMarketHashName: 'AK-47 | Redline',
        weapon: 'Rifle',
        rarity: 'Classified',
        iconUrl: null,
        availableWears: ['FT', 'MW'],
        catalogSeeded: true,
      },
    ]);
    prisma.itemDefinition.count.mockResolvedValue(1);

    const result = await service.listItems({ page: 1, limit: 24 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: 'item-seeded',
      activeLotCount: 1,
      featuredLotId: 'lot-1',
      minMarketplacePriceMinor: '1000',
      availableWears: ['FT', 'MW'],
      catalogSeeded: true,
    });
  });

  it('hydrates catalog list from cached Steam prices without live fetch', async () => {
    prisma.lot.findMany.mockResolvedValue([]);
    prisma.itemDefinition.findMany.mockResolvedValue([
      {
        id: 'item-a',
        marketHashName: 'AK-47 | Redline',
        baseMarketHashName: 'AK-47 | Redline',
        weapon: 'Rifle',
        rarity: 'Classified',
        iconUrl: null,
        availableWears: ['FT'],
        catalogSeeded: true,
      },
    ]);
    prisma.itemDefinition.count = jest.fn().mockResolvedValue(1);
    steamMarketPrice.getPricesWithMeta.mockResolvedValue({
      'AK-47 | Redline': {
        priceMinor: 1250,
        fetchedAt: '2026-07-11T12:00:00.000Z',
      },
    });

    const result = await service.listItems({ page: 1, limit: 24 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.steamPriceMinor).toBe(1250);
    expect(steamMarketPrice.getPricesWithMeta).toHaveBeenCalledWith(
      ['AK-47 | Redline'],
      { cacheOnly: true },
    );
    // No bulk live Steam refresh for empty seeded cards.
    expect(steamMarketPrice.getPricesWithMeta).toHaveBeenCalledTimes(1);
  });

  it('returns unlisted items when weapon filter matches but no lots exist', async () => {
    prisma.lot.findMany.mockResolvedValue([]);
    prisma.itemDefinition.count.mockResolvedValue(1);
    prisma.itemDefinition.findMany.mockResolvedValue([
      {
        id: 'item-knife',
        marketHashName: '★ Karambit | Doppler',
        baseMarketHashName: '★ Karambit | Doppler',
        weapon: 'Knife',
        rarity: 'Covert',
        iconUrl: null,
        availableWears: ['FN'],
        catalogSeeded: true,
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
          catalogSeeded: true,
          NOT: expect.objectContaining({
            OR: expect.arrayContaining([
              {
                marketHashName: {
                  contains: 'Service Medal',
                  mode: 'insensitive',
                },
              },
              {
                marketHashName: {
                  equals: 'AK-47',
                  mode: 'insensitive',
                },
              },
            ]),
          }),
          OR: [
            { marketHashName: { contains: 'Sticker', mode: 'insensitive' } },
            { marketHashName: { contains: 'Charm', mode: 'insensitive' } },
            { marketHashName: { contains: 'Patch', mode: 'insensitive' } },
          ],
        }),
      }),
    );
  });

  it('excludes medals and default stock weapons from catalog queries', async () => {
    prisma.lot.findMany.mockResolvedValue([]);
    prisma.itemDefinition.count.mockResolvedValue(0);
    prisma.itemDefinition.findMany.mockResolvedValue([]);

    await service.listItems({ page: 1, limit: 24 });

    expect(prisma.itemDefinition.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          game: 'CS2',
          catalogSeeded: true,
          NOT: expect.objectContaining({
            OR: expect.arrayContaining([
              {
                marketHashName: {
                  contains: 'Service Medal',
                  mode: 'insensitive',
                },
              },
              {
                marketHashName: {
                  equals: 'AWP',
                  mode: 'insensitive',
                },
              },
              {
                marketHashName: {
                  equals: 'Zeus x27',
                  mode: 'insensitive',
                },
              },
            ]),
          }),
        }),
      }),
    );
  });

  it('returns not found for non-listable catalog item detail', async () => {
    prisma.itemDefinition.findUnique.mockResolvedValue({
      id: 'medal-1',
      marketHashName: '2024 Service Medal',
      weapon: null,
      rarity: null,
      iconUrl: null,
    });

    await expect(service.getItem('medal-1')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
