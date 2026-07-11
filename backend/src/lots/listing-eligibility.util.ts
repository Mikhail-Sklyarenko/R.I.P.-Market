import { HttpStatus } from '@nestjs/common';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';

const NON_LISTABLE_MARKET_HASH_NAME_RE =
  /(?:Service Medal|Veteran Coin|Birthday Coin|Global Offensive Badge|Loyalty Badge|Premier Season|Operation Coin|Ten Year Veteran)/i;

export type ListingEligibilityAsset = {
  tradable: boolean;
  marketable?: boolean;
  tradeLockUntil: Date | null;
  itemDefinition: { marketHashName: string };
};

export function isListableMarketHashName(marketHashName: string): boolean {
  const normalized = marketHashName.trim();
  if (!normalized) {
    return false;
  }
  return !NON_LISTABLE_MARKET_HASH_NAME_RE.test(normalized);
}

export function assertListingEligible(
  asset: ListingEligibilityAsset & { status?: string },
): void {
  if (asset.status && asset.status !== 'AVAILABLE') {
    throw new AppException(
      ErrorCode.INVENTORY_ASSET_NOT_AVAILABLE,
      'This item is not available for listing',
      HttpStatus.BAD_REQUEST,
      { status: asset.status },
    );
  }
  if (!asset.tradable) {
    throw new AppException(
      ErrorCode.INVENTORY_ASSET_NOT_TRADABLE,
      'This item is not tradable',
      HttpStatus.BAD_REQUEST,
    );
  }
  if (asset.marketable === false) {
    throw new AppException(
      ErrorCode.INVENTORY_ASSET_NOT_LISTABLE,
      'This item is not marketable',
      HttpStatus.BAD_REQUEST,
    );
  }
  if (!isListableMarketHashName(asset.itemDefinition.marketHashName)) {
    throw new AppException(
      ErrorCode.INVENTORY_ASSET_NOT_LISTABLE,
      'This item type cannot be listed on the marketplace',
      HttpStatus.BAD_REQUEST,
      { marketHashName: asset.itemDefinition.marketHashName },
    );
  }
  if (asset.tradeLockUntil && asset.tradeLockUntil > new Date()) {
    throw new AppException(
      ErrorCode.INVENTORY_ASSET_TRADE_LOCKED,
      'This item is trade-locked',
      HttpStatus.BAD_REQUEST,
      { tradeLockUntil: asset.tradeLockUntil.toISOString() },
    );
  }
}
