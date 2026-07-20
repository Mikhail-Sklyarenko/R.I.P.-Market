import {
  aggregateMinPriceByBaseName,
  parseBulkSnapshotItems,
  resolveCatalogSteamPriceMinor,
} from './catalog-price-snapshot.util';

describe('catalog-price-snapshot util', () => {
  const parseUsd = (value?: string | number): number | null => {
    if (typeof value === 'number') {
      return Math.round(value * 100);
    }
    if (value === '$12.34') {
      return 1234;
    }
    if (value === '$8.00') {
      return 800;
    }
    return null;
  };

  it('parses bulk snapshot rows', () => {
    const map = parseBulkSnapshotItems(
      [
        { market_hash_name: 'Sticker | Titan', price: '$12.34' },
        { market_hash_name: '', price: '$1.00' },
      ],
      parseUsd,
    );
    expect(map.get('Sticker | Titan')).toBe(1234);
    expect(map.size).toBe(1);
  });

  it('aggregates minimum price by base skin name', () => {
    const snapshot = new Map<string, number>([
      ['AK-47 | Redline (Field-Tested)', 900],
      ['AK-47 | Redline (Minimal Wear)', 1200],
    ]);
    const base = aggregateMinPriceByBaseName(snapshot);
    expect(base.get('AK-47 | Redline')).toBe(900);
  });

  it('resolves catalog card price from exact or base name', () => {
    const snapshot = new Map<string, number>([
      ['Agent | KSK', 5000],
      ['AK-47 | Redline (Field-Tested)', 900],
    ]);
    const base = aggregateMinPriceByBaseName(snapshot);
    expect(resolveCatalogSteamPriceMinor('Agent | KSK', snapshot, base)).toBe(5000);
    expect(resolveCatalogSteamPriceMinor('AK-47 | Redline', snapshot, base)).toBe(
      900,
    );
  });
});
