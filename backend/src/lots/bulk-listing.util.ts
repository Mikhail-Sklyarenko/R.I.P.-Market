import { HttpStatus } from '@nestjs/common';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import {
  assertListingEligible,
  type ListingEligibilityAsset,
} from './listing-eligibility.util';

export const MAX_BULK_LISTING_COUNT = 50;

export type BulkListingAsset = ListingEligibilityAsset & {
  id: string;
  status: string;
  floatValue?: number | null;
  paintSeed?: number | null;
  wear?: string | null;
  stickers?: unknown[] | null;
};

export function hasInventoryFloatValue(
  floatValue: number | string | null | undefined,
): boolean {
  if (floatValue == null || floatValue === '') {
    return false;
  }
  if (typeof floatValue === 'number') {
    return Number.isFinite(floatValue);
  }
  const parsed = Number.parseFloat(floatValue);
  return Number.isFinite(parsed);
}

export function isFungibleInventoryAsset(asset: {
  floatValue?: number | string | null;
  paintSeed?: number | null;
  wear?: string | null;
  stickers?: unknown[] | null;
}): boolean {
  if (hasInventoryFloatValue(asset.floatValue)) {
    return false;
  }
  if (asset.paintSeed != null && Number.isFinite(asset.paintSeed)) {
    return false;
  }
  if (asset.wear) {
    return false;
  }
  if (Array.isArray(asset.stickers) && asset.stickers.length > 0) {
    return false;
  }
  return true;
}

export function assertBulkListingAssets(assets: BulkListingAsset[]): string {
  if (assets.length < 2) {
    throw new AppException(
      ErrorCode.BULK_LISTING_TOO_FEW,
      'Bulk listing requires at least two identical items',
      HttpStatus.BAD_REQUEST,
    );
  }
  if (assets.length > MAX_BULK_LISTING_COUNT) {
    throw new AppException(
      ErrorCode.BULK_LISTING_TOO_MANY,
      `Bulk listing supports up to ${MAX_BULK_LISTING_COUNT} items at once`,
      HttpStatus.BAD_REQUEST,
      { max: MAX_BULK_LISTING_COUNT },
    );
  }

  const marketHashName = assets[0]!.itemDefinition.marketHashName;

  for (const asset of assets) {
    if (!isFungibleInventoryAsset(asset)) {
      throw new AppException(
        ErrorCode.BULK_LISTING_NOT_ALLOWED,
        'Bulk listing is only available for identical items without float or pattern',
        HttpStatus.BAD_REQUEST,
        { inventoryAssetId: asset.id },
      );
    }
    if (asset.itemDefinition.marketHashName !== marketHashName) {
      throw new AppException(
        ErrorCode.BULK_LISTING_ASSET_MISMATCH,
        'All bulk listing items must share the same market hash name',
        HttpStatus.BAD_REQUEST,
      );
    }
    assertListingEligible(asset);
  }

  return marketHashName;
}
