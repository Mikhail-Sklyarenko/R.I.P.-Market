import { hasLotsListFilters } from './lots-list.util';

describe('hasLotsListFilters', () => {
  it('returns false for empty query', () => {
    expect(hasLotsListFilters({})).toBe(false);
  });

  it('returns true when search query is set', () => {
    expect(hasLotsListFilters({ q: 'AK-47' })).toBe(true);
  });

  it('returns true when price bounds are set', () => {
    expect(hasLotsListFilters({ minPriceMinor: 100 })).toBe(true);
    expect(hasLotsListFilters({ maxPriceMinor: 500_000 })).toBe(true);
  });

  it('returns true when sort or pagination is set', () => {
    expect(hasLotsListFilters({ sort: 'price_asc' })).toBe(true);
    expect(hasLotsListFilters({ page: 2 })).toBe(true);
    expect(hasLotsListFilters({ limit: 12 })).toBe(true);
  });

  it('returns false when only similarTo would be used', () => {
    expect(hasLotsListFilters({ similarTo: 'lot-id' } as never)).toBe(false);
  });
});
