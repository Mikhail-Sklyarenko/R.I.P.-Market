import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getRecommendedPriceMinor,
  getRecommendedPriceSource,
  minorToPriceInput,
} from '../utils/inventory-pricing.ts';

describe('inventory-pricing utils', () => {
  it('prefers marketplace min price over steam discount', () => {
    const minor = getRecommendedPriceMinor({
      steamPriceMinor: 2000,
      minMarketplacePriceMinor: '1500',
    });
    assert.equal(minor, 1500);
    assert.equal(
      getRecommendedPriceSource({
        steamPriceMinor: 2000,
        minMarketplacePriceMinor: '1500',
      }),
      'market',
    );
  });

  it('falls back to steam price minus five percent', () => {
    const minor = getRecommendedPriceMinor({
      steamPriceMinor: 1000,
      minMarketplacePriceMinor: null,
    });
    assert.equal(minor, 950);
    assert.equal(
      getRecommendedPriceSource({
        steamPriceMinor: 1000,
        minMarketplacePriceMinor: null,
      }),
      'steam',
    );
  });

  it('returns null when no hints are available', () => {
    assert.equal(
      getRecommendedPriceMinor({
        steamPriceMinor: null,
        minMarketplacePriceMinor: null,
      }),
      null,
    );
    assert.equal(getRecommendedPriceMinor(null), null);
  });

  it('formats minor units for price input', () => {
    assert.equal(minorToPriceInput(1099), '10.99');
  });
});
