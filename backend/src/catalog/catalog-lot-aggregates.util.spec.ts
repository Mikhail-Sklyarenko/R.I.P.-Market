import {
  buildCatalogLotAggregates,
  catalogIndexCacheKey,
} from './catalog-lot-aggregates.util';

describe('buildCatalogLotAggregates', () => {
  it('counts lots by base skin and picks the cheapest featured lot', () => {
    const result = buildCatalogLotAggregates(
      [
        {
          id: 'lot-cheap',
          priceMinor: 1000n,
          createdAt: new Date('2026-01-02T00:00:00.000Z'),
          inventoryAsset: {
            itemDefinitionId: 'wear-ft',
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
        {
          id: 'lot-expensive',
          priceMinor: 1800n,
          createdAt: new Date('2026-01-03T00:00:00.000Z'),
          inventoryAsset: {
            itemDefinitionId: 'wear-mw',
            wear: 'MW',
            floatValue: null,
            itemDefinition: {
              marketHashName: 'AK-47 | Redline (Minimal Wear)',
              baseMarketHashName: 'AK-47 | Redline',
            },
          },
          listingSnapshot: {
            wear: 'MW',
            floatValue: null,
            marketHashName: 'AK-47 | Redline (Minimal Wear)',
          },
        },
      ],
      {},
    );

    expect(result.lotStats.get('base:AK-47 | Redline')).toMatchObject({
      count: 2,
      minPriceMinor: 1000n,
    });
    expect(result.featuredLots.get('base:AK-47 | Redline')).toBe('lot-cheap');
  });
});

describe('catalogIndexCacheKey', () => {
  it('treats inStock as part of the cache identity', () => {
    const base = { page: 1, limit: 24, sort: 'newest' as const };
    const without = catalogIndexCacheKey(base);
    const withStock = catalogIndexCacheKey({ ...base, inStock: 'true' });
    const withStockAlt = catalogIndexCacheKey({ ...base, inStock: '1' });

    expect(withStock).not.toBe(without);
    expect(withStock).toBe(withStockAlt);
  });
});
