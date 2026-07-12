import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import {
  assertBulkListingAssets,
  isFungibleInventoryAsset,
  MAX_BULK_LISTING_COUNT,
} from './bulk-listing.util';

describe('bulk-listing.util', () => {
  const caseAsset = {
    id: 'asset-case-1',
    status: 'AVAILABLE',
    tradable: true,
    marketable: true,
    tradeLockUntil: null,
    floatValue: null,
    paintSeed: null,
    wear: null,
    stickers: null,
    itemDefinition: { marketHashName: 'Revolution Case' },
  };

  it('treats cases without float as fungible', () => {
    expect(isFungibleInventoryAsset(caseAsset)).toBe(true);
  });

  it('blocks skins with float from bulk listing', () => {
    expect(
      isFungibleInventoryAsset({
        floatValue: '0.154',
        paintSeed: null,
        wear: 'FT',
        stickers: null,
      }),
    ).toBe(false);
  });

  it('validates identical fungible assets for bulk listing', () => {
    const marketHashName = assertBulkListingAssets([
      caseAsset,
      { ...caseAsset, id: 'asset-case-2' },
    ]);
    expect(marketHashName).toBe('Revolution Case');
  });

  it('rejects mixed market hash names', () => {
    expect(() =>
      assertBulkListingAssets([
        caseAsset,
        {
          ...caseAsset,
          id: 'asset-case-2',
          itemDefinition: { marketHashName: 'Kilowatt Case' },
        },
      ]),
    ).toThrow(AppException);

    try {
      assertBulkListingAssets([
        caseAsset,
        {
          ...caseAsset,
          id: 'asset-case-2',
          itemDefinition: { marketHashName: 'Kilowatt Case' },
        },
      ]);
    } catch (error) {
      expect((error as AppException).code).toBe(
        ErrorCode.BULK_LISTING_ASSET_MISMATCH,
      );
    }
  });

  it('enforces bulk listing size limits', () => {
    const assets = Array.from({ length: MAX_BULK_LISTING_COUNT + 1 }, (_, i) => ({
      ...caseAsset,
      id: `asset-${i}`,
    }));

    expect(() => assertBulkListingAssets(assets)).toThrow(AppException);
  });
});
