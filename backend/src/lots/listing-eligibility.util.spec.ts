import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import {
  assertListingEligible,
  isListableMarketHashName,
} from './listing-eligibility.util';

describe('listing-eligibility.util', () => {
  const baseAsset = {
    status: 'AVAILABLE',
    tradable: true,
    marketable: true,
    tradeLockUntil: null,
    itemDefinition: { marketHashName: 'AK-47 | Redline (Field-Tested)' },
  };

  it('allows standard marketable skins', () => {
    expect(isListableMarketHashName('AK-47 | Redline (Field-Tested)')).toBe(
      true,
    );
    expect(() => assertListingEligible(baseAsset)).not.toThrow();
  });

  it('blocks service medals and coins', () => {
    expect(isListableMarketHashName('2024 Service Medal')).toBe(false);
    expect(isListableMarketHashName('10 Year Birthday Coin')).toBe(false);

    expect(() =>
      assertListingEligible({
        ...baseAsset,
        itemDefinition: { marketHashName: '2024 Service Medal' },
      }),
    ).toThrow(AppException);

    try {
      assertListingEligible({
        ...baseAsset,
        itemDefinition: { marketHashName: '2024 Service Medal' },
      });
    } catch (error) {
      expect(error).toBeInstanceOf(AppException);
      expect((error as AppException).code).toBe(
        ErrorCode.INVENTORY_ASSET_NOT_LISTABLE,
      );
    }
  });

  it('blocks non-marketable assets', () => {
    expect(() =>
      assertListingEligible({
        ...baseAsset,
        marketable: false,
      }),
    ).toThrow(AppException);
  });
});
