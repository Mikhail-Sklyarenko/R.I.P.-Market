import {
  buildPricingPreview,
  calculateCommissionMinor,
} from './lot-pricing.util';

describe('lot-pricing.util', () => {
  it('calculates 5% commission with floor', () => {
    expect(calculateCommissionMinor(100_000)).toBe(5_000);
    expect(calculateCommissionMinor(100_001)).toBe(5_000);
  });

  it('builds pricing preview', () => {
    expect(buildPricingPreview(100_000)).toEqual({
      priceMinor: 100_000,
      commissionMinor: 5_000,
      sellerReceiveMinor: 95_000,
    });
  });
});
