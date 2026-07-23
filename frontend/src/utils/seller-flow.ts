import {
  assetStatusLabel,
  lotStatusLabel,
  lotSummaryLabel,
} from '../i18n/cs2-labels.ts';
import { enMessages } from '../i18n/messages/en.ts';
import { ruMessages } from '../i18n/messages/ru.ts';
import { translate } from '../i18n/translate.ts';
import type { Locale } from '../i18n/types.ts';
import { isListableMarketHashName } from './lot-display.ts';

const messagesByLocale = {
  ru: ruMessages,
  en: enMessages,
} as const;

/** @deprecated Prefer lotStatusLabel(status, locale) */
export const LOT_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Активен',
  RESERVED: 'В сделке',
  SOLD: 'Продан',
  CANCELED: 'Отменён',
  BLOCKED: 'Заблокирован',
};

/** @deprecated Prefer lotSummaryLabel(status, locale) */
export const LOT_SUMMARY_LABELS: Record<string, string> = {
  ACTIVE: 'Активные',
  RESERVED: 'В сделке',
  SOLD: 'Продано',
  CANCELED: 'Отменены',
};

export function formatLotStatus(status: string, locale: Locale = 'ru'): string {
  return lotStatusLabel(status, locale);
}

export type InventoryStatusFilter = 'all' | 'AVAILABLE' | 'LISTED' | 'RESERVED';

export const INVENTORY_STATUS_FILTER_IDS: InventoryStatusFilter[] = [
  'all',
  'AVAILABLE',
  'LISTED',
  'RESERVED',
];

/** @deprecated Prefer INVENTORY_STATUS_FILTER_IDS + t('inventoryFilter.*') */
export const INVENTORY_STATUS_FILTERS: Array<{
  id: InventoryStatusFilter;
  label: string;
}> = [
  { id: 'all', label: 'Все' },
  { id: 'AVAILABLE', label: 'Доступен' },
  { id: 'LISTED', label: 'Выставлен' },
  { id: 'RESERVED', label: 'В сделке' },
];

export type LotStatusFilter = 'all' | 'ACTIVE' | 'RESERVED' | 'SOLD' | 'CANCELED';

export const LOT_STATUS_FILTER_IDS: LotStatusFilter[] = [
  'all',
  'ACTIVE',
  'RESERVED',
  'SOLD',
  'CANCELED',
];

/** @deprecated Prefer LOT_STATUS_FILTER_IDS + t('lotFilter.*') */
export const LOT_STATUS_FILTERS: Array<{ id: LotStatusFilter; label: string }> = [
  { id: 'all', label: 'Все' },
  { id: 'ACTIVE', label: 'Активные' },
  { id: 'RESERVED', label: 'В сделке' },
  { id: 'SOLD', label: 'Продано' },
  { id: 'CANCELED', label: 'Отменены' },
];

export const PENDING_PAYOUT_ORDER_STATUSES = new Set([
  'PAYMENT_RESERVED',
  'WAITING_TRADE',
  'TRADE_CONFIRMED',
  'SETTLEMENT_HOLD',
]);

export function computeSellerPendingReceiveMinor(
  orders: Array<{
    sellerId: string;
    status: string;
    lot: { sellerReceiveMinor: string };
  }>,
  sellerId?: string | null,
): number {
  if (!sellerId) {
    return 0;
  }
  let total = 0;
  for (const order of orders) {
    if (order.sellerId !== sellerId) {
      continue;
    }
    if (!PENDING_PAYOUT_ORDER_STATUSES.has(order.status)) {
      continue;
    }
    total += Number(order.lot.sellerReceiveMinor);
  }
  return total;
}

export function filterInventoryAssets<
  T extends {
    status: string;
    tradable: boolean;
    marketable?: boolean;
    tradeLockUntil?: string | null;
    itemDefinition: { marketHashName: string };
  },
>(
  assets: T[],
  search: string,
  statusFilter: InventoryStatusFilter,
  showUnavailable = false,
): T[] {
  const query = search.trim().toLowerCase();
  return assets.filter((asset) => {
    if (!isInventoryAssetVisible(asset, showUnavailable)) {
      return false;
    }
    if (statusFilter !== 'all' && asset.status !== statusFilter) {
      return false;
    }
    if (!query) {
      return true;
    }
    return asset.itemDefinition.marketHashName.toLowerCase().includes(query);
  });
}

type InventoryPriceHintLike = {
  steamPriceMinor?: number | null;
  minMarketplacePriceMinor?: string | number | null;
};

export type InventorySortOption = 'price-desc' | 'price-asc' | 'name';

export const INVENTORY_SORT_OPTIONS: Array<{
  id: InventorySortOption;
  label: string;
}> = [
  { id: 'price-desc', label: 'Сначала дорогие' },
  { id: 'price-asc', label: 'Сначала дешёвые' },
  { id: 'name', label: 'По названию' },
];

/**
 * Inventory sort price = Steam (same signal as the card primary in seller context).
 */
export function resolveInventorySortPriceMinor(
  hint?: InventoryPriceHintLike | null,
): number | null {
  if (!hint) {
    return null;
  }
  if (hint.steamPriceMinor != null && hint.steamPriceMinor > 0) {
    return hint.steamPriceMinor;
  }
  return null;
}

export function sortInventoryAssets<
  T extends { itemDefinition: { marketHashName: string } },
>(
  assets: T[],
  priceHints: Record<string, InventoryPriceHintLike>,
  sort: InventorySortOption = 'price-desc',
): T[] {
  return [...assets].sort((left, right) => {
    if (sort === 'name') {
      return left.itemDefinition.marketHashName.localeCompare(
        right.itemDefinition.marketHashName,
        'ru',
      );
    }

    const leftPrice = resolveInventorySortPriceMinor(
      priceHints[left.itemDefinition.marketHashName],
    );
    const rightPrice = resolveInventorySortPriceMinor(
      priceHints[right.itemDefinition.marketHashName],
    );
    // Missing prices go last for both asc and desc.
    if (leftPrice == null && rightPrice == null) {
      return left.itemDefinition.marketHashName.localeCompare(
        right.itemDefinition.marketHashName,
        'ru',
      );
    }
    if (leftPrice == null) {
      return 1;
    }
    if (rightPrice == null) {
      return -1;
    }

    if (rightPrice !== leftPrice) {
      return sort === 'price-asc' ? leftPrice - rightPrice : rightPrice - leftPrice;
    }

    return left.itemDefinition.marketHashName.localeCompare(
      right.itemDefinition.marketHashName,
      'ru',
    );
  });
}

/** @deprecated Prefer sortInventoryAssets(..., 'price-desc') */
export function sortInventoryAssetsBySteamPriceDesc<
  T extends { itemDefinition: { marketHashName: string } },
>(assets: T[], priceHints: Record<string, InventoryPriceHintLike>): T[] {
  return sortInventoryAssets(assets, priceHints, 'price-desc');
}

export function filterSellerLots<
  T extends { status: string; inventoryAsset: { itemDefinition: { marketHashName: string } } },
>(lots: T[], search: string, statusFilter: LotStatusFilter): T[] {
  const query = search.trim().toLowerCase();
  return lots.filter((lot) => {
    if (statusFilter !== 'all' && lot.status !== statusFilter) {
      return false;
    }
    if (!query) {
      return true;
    }
    return lot.inventoryAsset.itemDefinition.marketHashName.toLowerCase().includes(query);
  });
}

export function hasInventoryFloatValue(
  floatValue: string | number | null | undefined,
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
  floatValue?: string | null;
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

export function getBulkListableSiblings<
  T extends {
    id: string;
    status: string;
    tradable: boolean;
    marketable?: boolean;
    tradeLockUntil?: string | null;
    floatValue?: string | null;
    paintSeed?: number | null;
    wear?: string | null;
    stickers?: unknown[] | null;
    itemDefinition: { marketHashName: string };
  },
>(assets: T[], anchor: T): T[] {
  if (!isFungibleInventoryAsset(anchor)) {
    return canListAsset(anchor) ? [anchor] : [];
  }

  const marketHashName = anchor.itemDefinition.marketHashName;
  return assets.filter(
    (asset) =>
      canListAsset(asset) &&
      isFungibleInventoryAsset(asset) &&
      asset.itemDefinition.marketHashName === marketHashName,
  );
}

export type InventoryDisplayStack<T> = {
  key: string;
  representative: T;
  assets: T[];
  count: number;
};

/**
 * Collapse fungible duplicates (cases, capsules, etc.) into one tile per group.
 * Skins with float/wear stay one-per-card. Listable and non-listable stay separate.
 */
export function groupInventoryAssetsForDisplay<
  T extends {
    id: string;
    status: string;
    tradable: boolean;
    marketable?: boolean;
    tradeLockUntil?: string | null;
    floatValue?: string | null;
    paintSeed?: number | null;
    wear?: string | null;
    stickers?: unknown[] | null;
    itemDefinition: { marketHashName: string };
  },
>(assets: T[]): InventoryDisplayStack<T>[] {
  const stacks = new Map<string, T[]>();
  const order: string[] = [];

  for (const asset of assets) {
    const key = inventoryDisplayStackKey(asset);
    const existing = stacks.get(key);
    if (existing) {
      existing.push(asset);
    } else {
      stacks.set(key, [asset]);
      order.push(key);
    }
  }

  return order.map((key) => {
    const group = stacks.get(key)!;
    return {
      key,
      representative: group[0]!,
      assets: group,
      count: group.length,
    };
  });
}

export function inventoryDisplayStackKey(asset: {
  id: string;
  status: string;
  tradable: boolean;
  marketable?: boolean;
  tradeLockUntil?: string | null;
  floatValue?: string | null;
  paintSeed?: number | null;
  wear?: string | null;
  stickers?: unknown[] | null;
  itemDefinition: { marketHashName: string };
}): string {
  if (!isFungibleInventoryAsset(asset)) {
    return `unique:${asset.id}`;
  }

  const name = asset.itemDefinition.marketHashName;
  if (canListAsset(asset)) {
    return `fungible:listable:${name}`;
  }
  return `fungible:${asset.status}:${name}`;
}

export const SELLER_SALE_STEPS = [
  'Выставляете предмет и указываете цену.',
  'Покупатель резервирует средства — лот переходит в RESERVED.',
  'Вы отправляете trade offer в Steam покупателю.',
  'После подтверждения обмена получаете выплату за вычетом комиссии 5%.',
] as const;

/** @deprecated Prefer assetStatusLabel(status, locale) */
export const ASSET_STATUS_LABELS: Record<string, string> = {
  AVAILABLE: 'Доступен',
  LISTED: 'Выставлен',
  RESERVED: 'В сделке',
  SOLD: 'Продан',
  BLOCKED: 'Заблокирован',
  REMOVED: 'Удалён',
};

export function formatAssetStatus(status: string, locale: Locale = 'ru'): string {
  return assetStatusLabel(status, locale);
}

export function formatLotSummaryStatus(
  status: string,
  locale: Locale = 'ru',
): string {
  return lotSummaryLabel(status, locale);
}

export function canListAsset(asset: {
  status: string;
  tradable: boolean;
  marketable?: boolean;
  tradeLockUntil?: string | null;
  itemDefinition: { marketHashName: string };
}): boolean {
  if (asset.status !== 'AVAILABLE') {
    return false;
  }
  if (!asset.tradable) {
    return false;
  }
  if (asset.marketable === false) {
    return false;
  }
  if (!isListableMarketHashName(asset.itemDefinition.marketHashName)) {
    return false;
  }
  if (asset.tradeLockUntil && new Date(asset.tradeLockUntil) > new Date()) {
    return false;
  }
  return true;
}

/** LISTED asset with an ACTIVE lot — open the same overlay to edit/cancel. */
export function canEditListedAsset(asset: {
  status: string;
  activeLotId?: string | null;
}): boolean {
  return asset.status === 'LISTED' && Boolean(asset.activeLotId);
}

export function canOpenInventorySellPanel(asset: {
  status: string;
  tradable: boolean;
  marketable?: boolean;
  tradeLockUntil?: string | null;
  activeLotId?: string | null;
  itemDefinition: { marketHashName: string };
}): boolean {
  return canListAsset(asset) || canEditListedAsset(asset);
}

export function isInventoryAssetVisible(
  asset: {
    status: string;
    tradable: boolean;
    marketable?: boolean;
    tradeLockUntil?: string | null;
    itemDefinition: { marketHashName: string };
  },
  showUnavailable: boolean,
): boolean {
  if (showUnavailable) {
    return true;
  }
  if (asset.status === 'LISTED' || asset.status === 'RESERVED') {
    return true;
  }
  return canListAsset(asset);
}

export function assetUnavailableReason(
  asset: {
    status: string;
    tradable: boolean;
    marketable?: boolean;
    tradeLockUntil?: string | null;
    itemDefinition: { marketHashName: string };
  },
  locale: Locale = 'ru',
): string {
  const t = (key: string, params?: Record<string, string | number>) =>
    translate(messagesByLocale[locale], key, params);

  if (asset.status === 'LISTED') {
    return t('assetUnavailable.listed');
  }
  if (asset.status === 'RESERVED') {
    return t('assetUnavailable.reserved');
  }
  if (asset.status === 'SOLD') {
    return t('assetUnavailable.sold');
  }
  if (asset.status === 'BLOCKED') {
    return t('assetUnavailable.blocked');
  }
  if (asset.status !== 'AVAILABLE') {
    return t('assetUnavailable.status', {
      status: formatAssetStatus(asset.status, locale),
    });
  }
  if (!asset.tradable) {
    return t('assetUnavailable.notTradable');
  }
  if (asset.marketable === false) {
    return t('assetUnavailable.notMarketable');
  }
  if (!isListableMarketHashName(asset.itemDefinition.marketHashName)) {
    return t('assetUnavailable.notListableType');
  }
  if (asset.tradeLockUntil && new Date(asset.tradeLockUntil) > new Date()) {
    return t('assetUnavailable.tradeLock', {
      when: new Date(asset.tradeLockUntil).toLocaleString(
        locale === 'en' ? 'en-US' : 'ru-RU',
      ),
    });
  }
  return t('assetUnavailable.unavailable');
}
