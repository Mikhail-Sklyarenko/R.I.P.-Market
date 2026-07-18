import { HttpStatus } from '@nestjs/common';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';

/** Name fragments for Steam-unmarketable collectibles (medals, coins, badges). */
export const NON_LISTABLE_MARKET_HASH_NAME_FRAGMENTS = [
  'Service Medal',
  'Veteran Coin',
  'Birthday Coin',
  'Global Offensive Badge',
  'Loyalty Badge',
  'Premier Season',
  'Operation Coin',
  'Ten Year Veteran',
] as const;

/**
 * Exact Steam market_hash_name values for stock (default) weapons.
 * These cannot be sold on the Steam Community Market and must not appear
 * in the buy catalog or be listed on the marketplace.
 * Vanilla ★ knives are intentionally excluded — they are marketable.
 */
export const DEFAULT_STOCK_WEAPON_MARKET_HASH_NAMES = [
  // Pistols
  'Glock-18',
  'USP-S',
  'P2000',
  'Dual Berettas',
  'P250',
  'Five-SeveN',
  'Tec-9',
  'CZ75-Auto',
  'Desert Eagle',
  'R8 Revolver',
  // Rifles
  'AK-47',
  'M4A4',
  'M4A1-S',
  'Galil AR',
  'FAMAS',
  'SG 553',
  'AUG',
  // Snipers
  'AWP',
  'SSG 08',
  'SCAR-20',
  'G3SG1',
  // SMGs
  'MAC-10',
  'MP9',
  'MP7',
  'MP5-SD',
  'UMP-45',
  'P90',
  'PP-Bizon',
  // Heavy
  'Nova',
  'XM1014',
  'MAG-7',
  'Sawed-Off',
  'M249',
  'Negev',
  // Equipment
  'Zeus x27',
] as const;

const DEFAULT_STOCK_WEAPON_NAMES_LOWER = new Set(
  DEFAULT_STOCK_WEAPON_MARKET_HASH_NAMES.map((name) => name.toLowerCase()),
);

export type ListingEligibilityAsset = {
  tradable: boolean;
  marketable?: boolean;
  tradeLockUntil: Date | null;
  itemDefinition: { marketHashName: string };
};

export function isDefaultStockWeaponMarketHashName(
  marketHashName: string,
): boolean {
  return DEFAULT_STOCK_WEAPON_NAMES_LOWER.has(marketHashName.trim().toLowerCase());
}

export function isListableMarketHashName(marketHashName: string): boolean {
  const normalized = marketHashName.trim();
  if (!normalized) {
    return false;
  }

  const lower = normalized.toLowerCase();
  for (const fragment of NON_LISTABLE_MARKET_HASH_NAME_FRAGMENTS) {
    if (lower.includes(fragment.toLowerCase())) {
      return false;
    }
  }

  if (isDefaultStockWeaponMarketHashName(normalized)) {
    return false;
  }

  return true;
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
