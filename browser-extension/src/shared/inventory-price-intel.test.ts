import { describe, expect, it } from 'vitest';
import {
  calculateSellerReceiveMinor,
  chunkMarketHashNames,
  getDefaultListPriceMinor,
  getRecommendedListPriceMinor,
  resolveInventoryPriceIntel,
} from './inventory-price-intel.js';

describe('inventory-price-intel', () => {
  it('recommends Steam −5% and net after 5% fee', () => {
    expect(getRecommendedListPriceMinor({ steamPriceMinor: 10000 })).toBe(9500);
    expect(calculateSellerReceiveMinor(9500)).toBe(9025);
  });

  it('prefers best bid as default list price when present', () => {
    expect(
      getDefaultListPriceMinor({
        steamPriceMinor: 2000,
        bestBidMinor: '1500',
      }),
    ).toBe(1500);
    expect(getDefaultListPriceMinor({ steamPriceMinor: 2000 })).toBe(1900);
  });

  it('prefers I2 server suggestedListMinor when present', () => {
    expect(
      getDefaultListPriceMinor({
        steamPriceMinor: 2000,
        bestBidMinor: '1500',
        suggestedListMinor: 1400,
      }),
    ).toBe(1400);
  });

  it('builds R.I.P-primary price strip with Steam secondary', () => {
    const view = resolveInventoryPriceIntel({
      hint: {
        steamPriceMinor: 1316,
        minMarketplacePriceMinor: '1100',
      },
    });
    expect(view.recommendedListMinor).toBe(1250);
    expect(view.primaryLine).toBe('R.I.P ~$12.50');
    expect(view.compactPrimaryLine).toBe('~$12.50');
    expect(view.secondaryLine).toContain('Steam $13.16');
    expect(view.secondaryLine).toContain('на R.I.P от $11.00');
    expect(view.netLine).toBe('вам ~$11.88');
    expect(view.bidLine).toBeNull();
  });

  it('surfaces best bid as primary demand signal', () => {
    const view = resolveInventoryPriceIntel({
      hint: {
        steamPriceMinor: 2000,
        minMarketplacePriceMinor: '1800',
        bestBidMinor: '1700',
        bestBidQuantity: 2,
      },
    });
    expect(view.primaryLine).toBe('Bid $17.00');
    expect(view.compactPrimaryLine).toBe('Bid $17.00');
    expect(view.bidLine).toBe('bid $17.00 · ×2');
    expect(view.netLine).toBe('вам ~$16.15');
  });

  it('prefers listed price as primary', () => {
    const view = resolveInventoryPriceIntel({
      hint: {
        steamPriceMinor: 2000,
        minMarketplacePriceMinor: '1500',
        bestBidMinor: '1400',
      },
      listedPriceMinor: '1800',
    });
    expect(view.primaryLine).toBe('R.I.P $18.00');
    expect(view.compactPrimaryLine).toBe('$18.00');
    expect(view.netLine).toBe('вам ~$17.10');
    expect(view.bidLine).toBeNull();
  });

  it('falls back to marketplace min when Steam guide missing', () => {
    const view = resolveInventoryPriceIntel({
      hint: { steamPriceMinor: null, minMarketplacePriceMinor: '900' },
    });
    expect(view.primaryLine).toBe('R.I.P от $9.00');
    expect(view.compactPrimaryLine).toBe('от $9.00');
    expect(view.netLine).toBeNull();
  });

  it('chunks market hash names', () => {
    expect(chunkMarketHashNames(['a', 'b', 'a'], 2)).toEqual([['a', 'b']]);
    expect(chunkMarketHashNames(['1', '2', '3'], 2)).toEqual([
      ['1', '2'],
      ['3'],
    ]);
  });
});
