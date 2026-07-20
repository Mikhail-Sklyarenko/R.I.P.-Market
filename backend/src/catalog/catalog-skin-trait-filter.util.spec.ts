import { applyCatalogSkinTraitFilters } from './catalog-skin-trait-filter.util';

describe('applyCatalogSkinTraitFilters', () => {
  it('filters StatTrak-only cards', () => {
    const where = {};
    applyCatalogSkinTraitFilters(where, { stattrak: 'only' });
    expect(where).toEqual({
      AND: [
        {
          marketHashName: {
            startsWith: 'StatTrak',
            mode: 'insensitive',
          },
        },
      ],
    });
  });

  it('excludes StatTrak and Souvenir together', () => {
    const where = { game: 'CS2' };
    applyCatalogSkinTraitFilters(where, {
      stattrak: 'exclude',
      souvenir: 'exclude',
    });
    expect(where.AND).toHaveLength(2);
  });

  it('merges with existing AND conditions', () => {
    const where = { AND: [{ catalogSeeded: true }] };
    applyCatalogSkinTraitFilters(where, { souvenir: 'only' });
    expect(where.AND).toHaveLength(2);
  });
});
