import type { CatalogItem } from '../api/types';

type CatalogNavigationItem = Pick<
  CatalogItem,
  'id' | 'activeLotCount' | 'featuredLotId'
>;

/** Route catalog cards to a lot when there is only one active offer. */
export function getCatalogItemPath(item: CatalogNavigationItem): string {
  if (item.activeLotCount === 1 && item.featuredLotId) {
    return `/lots/${item.featuredLotId}`;
  }
  return `/catalog/items/${item.id}`;
}

export function getCatalogBuyPath(item: CatalogNavigationItem): string | null {
  if (!item.featuredLotId || item.activeLotCount <= 0) {
    return null;
  }
  return `/lots/${item.featuredLotId}`;
}

export function shouldRedirectItemPageToLot(
  item: CatalogNavigationItem,
  loadedLotCount: number,
): boolean {
  if (item.activeLotCount !== 1) {
    return false;
  }
  return loadedLotCount === 1 || Boolean(item.featuredLotId);
}

export function resolveSingleLotId(
  item: CatalogNavigationItem,
  lots: { id: string }[],
): string | null {
  if (item.activeLotCount !== 1) {
    return null;
  }
  return lots[0]?.id ?? item.featuredLotId ?? null;
}
