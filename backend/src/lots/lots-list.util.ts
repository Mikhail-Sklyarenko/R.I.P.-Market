import type { ListLotsQueryDto } from './dto/list-lots-query.dto';

export function hasLotsListFilters(query: ListLotsQueryDto): boolean {
  return Boolean(
    query.itemDefinitionId ||
    query.q ||
    query.minPriceMinor !== undefined ||
    query.maxPriceMinor !== undefined ||
    query.weapon ||
    query.rarity ||
    query.wear ||
    query.floatMin !== undefined ||
    query.floatMax !== undefined ||
    query.sort ||
    query.page !== undefined ||
    query.limit !== undefined,
  );
}

export const DEFAULT_LOTS_PAGE_LIMIT = 24;
