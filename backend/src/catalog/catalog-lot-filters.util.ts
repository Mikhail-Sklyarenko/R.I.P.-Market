import type { Prisma } from '@prisma/client';
import { parseFloatValue } from '../lots/float-tier.util';
import type { ListCatalogItemsQueryDto } from './dto/list-catalog-items-query.dto';

export type CatalogLotWearFloatSource = {
  inventoryAsset: {
    wear: string | null;
    floatValue: Prisma.Decimal | null;
  };
  listingSnapshot: {
    wear: string | null;
    floatValue: Prisma.Decimal | null;
  } | null;
};

export function catalogLotMatchesWearFloatFilters(
  lot: CatalogLotWearFloatSource,
  query: Pick<ListCatalogItemsQueryDto, 'wear' | 'floatMin' | 'floatMax'>,
): boolean {
  const wear = lot.listingSnapshot?.wear ?? lot.inventoryAsset.wear;
  if (query.wear && wear?.toUpperCase() !== query.wear.toUpperCase()) {
    return false;
  }

  const floatValue =
    lot.listingSnapshot?.floatValue ?? lot.inventoryAsset.floatValue;
  const numeric = parseFloatValue(floatValue);
  if (numeric === null) {
    return query.floatMin === undefined && query.floatMax === undefined;
  }
  if (query.floatMin !== undefined && numeric < query.floatMin) {
    return false;
  }
  if (query.floatMax !== undefined && numeric > query.floatMax) {
    return false;
  }
  return true;
}
