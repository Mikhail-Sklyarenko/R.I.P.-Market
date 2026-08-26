import { resolveSuggestedListPrice, steamDiscountListMinor } from './suggested-list-price.util';

describe('suggested-list-price.util (I2)', () => {
  it('prefers best bid over Steam −5%', () => {
    expect(
      resolveSuggestedListPrice({
        steamPriceMinor: 2000,
        bestBidMinor: '1500',
      }),
    ).toEqual({
      suggestedListMinor: 1500,
      suggestedListSource: 'bid',
      commissionMinor: 75,
      sellerReceiveMinor: 1425,
    });
  });

  it('falls back to Steam −5% with fee preview', () => {
    expect(steamDiscountListMinor(10000)).toBe(9500);
    expect(
      resolveSuggestedListPrice({ steamPriceMinor: 10000 }),
    ).toEqual({
      suggestedListMinor: 9500,
      suggestedListSource: 'steam_discount',
      commissionMinor: 475,
      sellerReceiveMinor: 9025,
    });
  });

  it('returns nulls when no signal', () => {
    expect(resolveSuggestedListPrice({})).toEqual({
      suggestedListMinor: null,
      suggestedListSource: null,
      commissionMinor: null,
      sellerReceiveMinor: null,
    });
  });
});
