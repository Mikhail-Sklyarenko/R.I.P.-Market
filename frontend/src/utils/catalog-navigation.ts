import type { CatalogItem } from '../api/types';
import { getCatalogItemRef } from './item-slug.ts';

type CatalogNavigationItem = Pick<
  CatalogItem,
  'id' | 'slug' | 'activeLotCount' | 'featuredLotId'
>;

/** Catalog cards always open the named item page. */
export function getCatalogItemPath(item: CatalogNavigationItem): string {
  return `/catalog/items/${getCatalogItemRef(item)}`;
}

/** Buy CTA jumps to a specific listing instance. */
export function getCatalogBuyPath(item: CatalogNavigationItem): string | null {
  if (!item.featuredLotId || item.activeLotCount <= 0) {
    return null;
  }
  return `/lots/${item.featuredLotId}`;
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
