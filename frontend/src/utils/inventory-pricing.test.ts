import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getRecommendedPriceMinor,
  getRecommendedPriceSource,
  minorToPriceInput,
} from '../utils/inventory-pricing.ts';

describe('inventory-pricing utils', () => {
  it('recommends steam minus five percent even when marketplace min exists', () => {
    const minor = getRecommendedPriceMinor({
      steamPriceMinor: 2000,
      buffPriceMinor: null,
      csfloatPriceMinor: null,
      minMarketplacePriceMinor: '1500',
    });
    assert.equal(minor, 1900);
    assert.equal(
      getRecommendedPriceSource({
        steamPriceMinor: 2000,
        buffPriceMinor: null,
        csfloatPriceMinor: null,
        minMarketplacePriceMinor: '1500',
      }),
      'steam',
    );
  });

  it('ignores outlier marketplace lots for recommendations', () => {
    const minor = getRecommendedPriceMinor({
      steamPriceMinor: 3,
      buffPriceMinor: null,
      csfloatPriceMinor: null,
      minMarketplacePriceMinor: '1000',
    });
    assert.equal(minor, 3);
  });

  it('falls back to null without steam', () => {
    assert.equal(
      getRecommendedPriceMinor({
        steamPriceMinor: null,
        buffPriceMinor: null,
        csfloatPriceMinor: null,
        minMarketplacePriceMinor: '1500',
      }),
      null,
    );
    assert.equal(getRecommendedPriceMinor(null), null);
  });

  it('formats minor units for price input', () => {
    assert.equal(minorToPriceInput(1099), '10.99');
  });
});
