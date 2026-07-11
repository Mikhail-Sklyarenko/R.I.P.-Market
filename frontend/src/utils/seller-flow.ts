import { isListableMarketHashName } from './lot-display';

export const LOT_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Активен',
  RESERVED: 'В сделке',
  SOLD: 'Продан',
  CANCELED: 'Отменён',
  BLOCKED: 'Заблокирован',
};

export const LOT_SUMMARY_LABELS: Record<string, string> = {
  ACTIVE: 'Активные',
  RESERVED: 'В сделке',
  SOLD: 'Продано',
  CANCELED: 'Отменены',
};

export function formatLotStatus(status: string): string {
  return LOT_STATUS_LABELS[status] ?? status;
}

export type InventoryStatusFilter = 'all' | 'AVAILABLE' | 'LISTED' | 'RESERVED';

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

export const SELLER_SALE_STEPS = [
  'Выставляете предмет и указываете цену.',
  'Покупатель резервирует средства — лот переходит в RESERVED.',
  'Вы отправляете trade offer в Steam покупателю.',
  'После подтверждения обмена получаете выплату за вычетом комиссии 5%.',
] as const;

export const ASSET_STATUS_LABELS: Record<string, string> = {
  AVAILABLE: 'Доступен',
  LISTED: 'Выставлен',
  RESERVED: 'В сделке',
  SOLD: 'Продан',
  BLOCKED: 'Заблокирован',
  REMOVED: 'Удалён',
};

export function formatAssetStatus(status: string): string {
  return ASSET_STATUS_LABELS[status] ?? status;
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

export function assetUnavailableReason(asset: {
  status: string;
  tradable: boolean;
  marketable?: boolean;
  tradeLockUntil?: string | null;
  itemDefinition: { marketHashName: string };
}): string {
  if (asset.status === 'LISTED') {
    return 'Уже выставлен на продажу';
  }
  if (asset.status === 'RESERVED') {
    return 'Предмет в активной сделке';
  }
  if (asset.status === 'SOLD') {
    return 'Предмет уже продан';
  }
  if (asset.status === 'BLOCKED') {
    return 'Предмет заблокирован';
  }
  if (asset.status !== 'AVAILABLE') {
    return `Статус: ${formatAssetStatus(asset.status)}`;
  }
  if (!asset.tradable) {
    return 'Нельзя обменять';
  }
  if (asset.marketable === false) {
    return 'Нельзя продать на маркете';
  }
  if (!isListableMarketHashName(asset.itemDefinition.marketHashName)) {
    return 'Тип предмета нельзя выставить';
  }
  if (asset.tradeLockUntil && new Date(asset.tradeLockUntil) > new Date()) {
    return `Trade-lock до ${new Date(asset.tradeLockUntil).toLocaleString()}`;
  }
  return 'Недоступен';
}
