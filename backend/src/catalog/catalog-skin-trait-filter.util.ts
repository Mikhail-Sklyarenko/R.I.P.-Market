import type { Prisma } from '@prisma/client';

export type SkinTraitFilterMode = 'only' | 'exclude';

export const STATTRAK_MARKET_HASH_PREFIX = 'StatTrak';
export const SOUVENIR_MARKET_HASH_PREFIX = 'Souvenir';

export function applyCatalogSkinTraitFilters(
  where: Prisma.ItemDefinitionWhereInput,
  options: {
    stattrak?: SkinTraitFilterMode;
    souvenir?: SkinTraitFilterMode;
  },
): void {
  const conditions: Prisma.ItemDefinitionWhereInput[] = [];

  if (options.stattrak === 'only') {
    conditions.push({
      marketHashName: {
        startsWith: STATTRAK_MARKET_HASH_PREFIX,
        mode: 'insensitive',
      },
    });
  } else if (options.stattrak === 'exclude') {
    conditions.push({
      NOT: {
        marketHashName: {
          startsWith: STATTRAK_MARKET_HASH_PREFIX,
          mode: 'insensitive',
        },
      },
    });
  }

  if (options.souvenir === 'only') {
    conditions.push({
      marketHashName: {
        startsWith: SOUVENIR_MARKET_HASH_PREFIX,
        mode: 'insensitive',
      },
    });
  } else if (options.souvenir === 'exclude') {
    conditions.push({
      NOT: {
        marketHashName: {
          startsWith: SOUVENIR_MARKET_HASH_PREFIX,
          mode: 'insensitive',
        },
      },
    });
  }

  if (conditions.length === 0) {
    return;
  }

  where.AND = [
    ...(Array.isArray(where.AND)
      ? where.AND
      : where.AND
        ? [where.AND]
        : []),
    ...conditions,
  ];
}
