import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import {
  assertListingEligible,
  isDefaultStockWeaponMarketHashName,
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

  it('allows marketable non-skin catalog items', () => {
    expect(isListableMarketHashName('Revolution Case')).toBe(true);
    expect(isListableMarketHashName('Sticker | Inferno (Holo)')).toBe(true);
    expect(isListableMarketHashName('★ Karambit | Doppler (Factory New)')).toBe(
      true,
    );
    // Vanilla ★ knives remain marketable on Steam
    expect(isListableMarketHashName('★ Karambit')).toBe(true);
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

  it('blocks default stock weapons that cannot be sold on Steam', () => {
    expect(isDefaultStockWeaponMarketHashName('AK-47')).toBe(true);
    expect(isDefaultStockWeaponMarketHashName('ak-47')).toBe(true);
    expect(isDefaultStockWeaponMarketHashName('Zeus x27')).toBe(true);
    expect(isListableMarketHashName('AK-47')).toBe(false);
    expect(isListableMarketHashName('M4A1-S')).toBe(false);
    expect(isListableMarketHashName('AWP')).toBe(false);
    expect(isListableMarketHashName('Desert Eagle')).toBe(false);

    expect(() =>
      assertListingEligible({
        ...baseAsset,
        itemDefinition: { marketHashName: 'AK-47' },
      }),
    ).toThrow(AppException);
  });

  it('does not treat skinned weapons as default stock', () => {
    expect(isDefaultStockWeaponMarketHashName('AK-47 | Redline (Field-Tested)')).toBe(
      false,
    );
    expect(isListableMarketHashName('AK-47 | Redline (Field-Tested)')).toBe(true);
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
