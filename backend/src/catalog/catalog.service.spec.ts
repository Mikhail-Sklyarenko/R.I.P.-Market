import { CatalogService } from './catalog.service';

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
      'AK-47 | Redline (Field-Tested)': {
        priceMinor: 1250,
        fetchedAt: '2026-07-11T12:00:00.000Z',
      },
    });

    const result = await service.listItems({ page: 1, limit: 24 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.steamPriceMinor).toBe(1250);
    expect(steamMarketPrice.getPricesWithMeta).toHaveBeenCalledWith(
      ['AK-47 | Redline (Field-Tested)'],
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
        weapon: 'Karambit',
        rarity: 'Covert',
        iconUrl: null,
        availableWears: ['FN'],
        catalogSeeded: true,
      },
    ]);

    const result = await service.listItems({
      page: 1,
      limit: 24,
      weapon: 'Karambit',
    });

    expect(prisma.itemDefinition.findMany).toHaveBeenCalled();
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.activeLotCount).toBe(0);
  });

  it('matches any listed weapon when weapon contains pipe-separated terms', async () => {
    prisma.lot.findMany.mockResolvedValue([]);
    prisma.itemDefinition.findMany.mockResolvedValue([]);

    await service.listItems({
      page: 1,
      limit: 24,
      weapon: 'Sport Gloves|Hand Wraps',
    });

    expect(prisma.itemDefinition.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          game: 'CS2',
          catalogSeeded: true,
          OR: [
            { weapon: { equals: 'Sport Gloves', mode: 'insensitive' } },
            { weapon: { equals: 'Hand Wraps', mode: 'insensitive' } },
          ],
        }),
      }),
    );
  });

  it('combines weapon and marketHashName filters for pin-style queries', async () => {
    prisma.lot.findMany.mockResolvedValue([]);
    prisma.itemDefinition.findMany.mockResolvedValue([]);

    await service.listItems({
      page: 1,
      limit: 24,
      weapon: 'Collectible',
      q: 'Pin',
    });

    expect(prisma.itemDefinition.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          game: 'CS2',
          catalogSeeded: true,
          weapon: { equals: 'Collectible', mode: 'insensitive' },
          marketHashName: { contains: 'Pin', mode: 'insensitive' },
        }),
      }),
    );
  });

  it('filters by exact marketHashName when provided (case picker)', async () => {
    prisma.lot.findMany.mockResolvedValue([]);
    prisma.itemDefinition.findMany.mockResolvedValue([]);

    await service.listItems({
      page: 1,
      limit: 24,
      weapon: 'Case',
      marketHashName: 'CS:GO Weapon Case',
      q: 'CS:GO Weapon Case',
    });

    expect(prisma.itemDefinition.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          game: 'CS2',
          catalogSeeded: true,
          weapon: { equals: 'Case', mode: 'insensitive' },
          marketHashName: {
            equals: 'CS:GO Weapon Case',
            mode: 'insensitive',
          },
        }),
      }),
    );
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

  it('sorts catalog by newest active listing first', async () => {
    prisma.lot.findMany.mockImplementation((args: { select?: unknown; orderBy?: unknown }) => {
      if (args.orderBy) {
        return Promise.resolve([]);
      }
      if (
        args.select &&
        typeof args.select === 'object' &&
        args.select !== null &&
        'priceMinor' in args.select
      ) {
        return Promise.resolve([
          {
            priceMinor: 2000n,
            createdAt: new Date('2026-01-10T12:00:00.000Z'),
            inventoryAsset: {
              itemDefinitionId: 'item-old',
              wear: 'FT',
              floatValue: null,
              itemDefinition: {
                marketHashName: 'AK-47 | Redline (Field-Tested)',
                baseMarketHashName: 'AK-47 | Redline',
              },
            },
            listingSnapshot: { wear: 'FT', floatValue: null },
          },
          {
            priceMinor: 1500n,
            createdAt: new Date('2026-02-15T12:00:00.000Z'),
            inventoryAsset: {
              itemDefinitionId: 'item-new',
              wear: 'MW',
              floatValue: null,
              itemDefinition: {
                marketHashName: 'AWP | Asiimov (Minimal Wear)',
                baseMarketHashName: 'AWP | Asiimov',
              },
            },
            listingSnapshot: { wear: 'MW', floatValue: null },
          },
        ]);
      }
      return Promise.resolve([]);
    });
    prisma.itemDefinition.findMany.mockResolvedValue([
      {
        id: 'item-old',
        marketHashName: 'AK-47 | Redline',
        baseMarketHashName: 'AK-47 | Redline',
        weapon: 'Rifle',
        rarity: 'Classified',
        iconUrl: null,
        availableWears: ['FT'],
        catalogSeeded: true,
      },
      {
        id: 'item-new',
        marketHashName: 'AWP | Asiimov',
        baseMarketHashName: 'AWP | Asiimov',
        weapon: 'Sniper Rifle',
        rarity: 'Covert',
        iconUrl: null,
        availableWears: ['MW'],
        catalogSeeded: true,
      },
      {
        id: 'item-empty',
        marketHashName: 'Revolution Case',
        baseMarketHashName: 'Revolution Case',
        weapon: null,
        rarity: 'Base Grade',
        iconUrl: null,
        availableWears: [],
        catalogSeeded: true,
      },
    ]);

    const result = await service.listItems({ page: 1, limit: 24, sort: 'newest' });

    expect(result.items.map((item) => item.id)).toEqual([
      'item-new',
      'item-old',
      'item-empty',
    ]);
    expect(result.items[0]?.latestListedAt).toBe('2026-02-15T12:00:00.000Z');
  });

  it('sorts catalog by marketplace price ascending', async () => {
    prisma.lot.findMany.mockImplementation((args: { select?: unknown; orderBy?: unknown }) => {
      if (args.orderBy) {
        return Promise.resolve([]);
      }
      if (
        args.select &&
        typeof args.select === 'object' &&
        args.select !== null &&
        'priceMinor' in args.select
      ) {
        return Promise.resolve([
          {
            priceMinor: 3000n,
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            inventoryAsset: {
              itemDefinitionId: 'item-expensive',
              wear: null,
              floatValue: null,
              itemDefinition: {
                marketHashName: 'AWP | Asiimov',
                baseMarketHashName: 'AWP | Asiimov',
              },
            },
            listingSnapshot: null,
          },
          {
            priceMinor: 1000n,
            createdAt: new Date('2026-01-02T00:00:00.000Z'),
            inventoryAsset: {
              itemDefinitionId: 'item-cheap',
              wear: null,
              floatValue: null,
              itemDefinition: {
                marketHashName: 'AK-47 | Redline',
                baseMarketHashName: 'AK-47 | Redline',
              },
            },
            listingSnapshot: null,
          },
        ]);
      }
      return Promise.resolve([]);
    });
    prisma.itemDefinition.findMany.mockResolvedValue([
      {
        id: 'item-expensive',
        marketHashName: 'AWP | Asiimov',
        baseMarketHashName: 'AWP | Asiimov',
        weapon: 'Sniper Rifle',
        rarity: 'Covert',
        iconUrl: null,
        availableWears: [],
        catalogSeeded: true,
      },
      {
        id: 'item-cheap',
        marketHashName: 'AK-47 | Redline',
        baseMarketHashName: 'AK-47 | Redline',
        weapon: 'Rifle',
        rarity: 'Classified',
        iconUrl: null,
        availableWears: [],
        catalogSeeded: true,
      },
    ]);

    const result = await service.listItems({ page: 1, limit: 24, sort: 'cheapest' });

    expect(result.items.map((item) => item.id)).toEqual(['item-cheap', 'item-expensive']);
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

  it('resolves catalog item detail by slug', async () => {
    prisma.itemDefinition.findUnique.mockImplementation(({ where }: { where: { id?: string; slug?: string } }) => {
      if (where.slug === 'ak-47-redline') {
        return Promise.resolve({
          id: 'item-redline',
          slug: 'ak-47-redline',
          marketHashName: 'AK-47 | Redline (Field-Tested)',
          baseMarketHashName: 'AK-47 | Redline',
          weapon: 'Rifle',
          rarity: 'Classified',
          iconUrl: null,
          availableWears: ['FT'],
          catalogSeeded: true,
        });
      }
      return Promise.resolve(null);
    });
    prisma.lot.findMany.mockResolvedValue([]);

    const result = await service.getItem('ak-47-redline');

    expect(result.id).toBe('item-redline');
    expect(result.slug).toBe('ak-47-redline');
  });
});
