import {
  buildMarketHashNameWithWear,
  deriveBaseMarketHashName,
} from '../item-definitions/base-market-hash-name.util';
import { isUuid, slugifyMarketHashName } from '../item-definitions/item-slug.util';
import type { PrismaService } from '../prisma/prisma.service';

type CatalogItemRow = {
  id: string;
  marketHashName: string;
  baseMarketHashName: string | null;
  catalogSeeded: boolean;
  weapon: string | null;
  rarity: string | null;
  iconUrl: string | null;
  availableWears: unknown;
};

function parseAvailableWears(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === 'string');
}

async function findCatalogItem(
  prisma: PrismaService,
  ref: string,
): Promise<CatalogItemRow | null> {
  const select = {
    id: true,
    marketHashName: true,
    baseMarketHashName: true,
    catalogSeeded: true,
    weapon: true,
    rarity: true,
    iconUrl: true,
    availableWears: true,
  } as const;

  if (isUuid(ref)) {
    return prisma.itemDefinition.findUnique({ where: { id: ref }, select });
  }

  const bySlug = await prisma.itemDefinition.findUnique({
    where: { slug: ref },
    select,
  });
  if (bySlug) {
    return bySlug;
  }

  return prisma.itemDefinition.findUnique({ where: { id: ref }, select });
}

async function resolveWearItemDefinition(
  prisma: PrismaService,
  catalogItem: CatalogItemRow,
  wear: string,
) {
  const availableWears = parseAvailableWears(catalogItem.availableWears);
  if (
    catalogItem.catalogSeeded &&
    availableWears.length > 0 &&
    !availableWears.includes(wear)
  ) {
    return null;
  }

  if (!catalogItem.catalogSeeded) {
    return catalogItem;
  }

  const baseName =
    catalogItem.baseMarketHashName ??
    deriveBaseMarketHashName(catalogItem.marketHashName);
  const marketHashName = buildMarketHashNameWithWear(baseName, wear);

  return prisma.itemDefinition.upsert({
    where: { marketHashName },
    create: {
      game: 'CS2',
      marketHashName,
      slug: slugifyMarketHashName(marketHashName),
      baseMarketHashName: baseName,
      weapon: catalogItem.weapon,
      rarity: catalogItem.rarity,
      iconUrl: catalogItem.iconUrl,
      catalogSeeded: false,
    },
    update: {
      baseMarketHashName: baseName,
      slug: slugifyMarketHashName(marketHashName),
      weapon: catalogItem.weapon ?? undefined,
      rarity: catalogItem.rarity ?? undefined,
      ...(catalogItem.iconUrl?.trim()
        ? { iconUrl: catalogItem.iconUrl.trim() }
        : {}),
    },
    select: { id: true },
  });
}

export type OrderBookItemScope = {
  catalogItem: CatalogItemRow;
  itemDefinitionIds: string[];
  baseMarketHashName: string | null;
  wear: string | null;
};

export async function resolveOrderBookItemScope(
  prisma: PrismaService,
  itemRef: string,
  wear?: string,
): Promise<OrderBookItemScope | null> {
  const catalogItem = await findCatalogItem(prisma, itemRef);
  if (!catalogItem) {
    return null;
  }

  const normalizedWear = wear?.trim() || null;

  if (normalizedWear) {
    const wearItem = await resolveWearItemDefinition(
      prisma,
      catalogItem,
      normalizedWear,
    );
    if (!wearItem) {
      return null;
    }
    return {
      catalogItem,
      itemDefinitionIds: [wearItem.id],
      baseMarketHashName:
        catalogItem.baseMarketHashName ??
        deriveBaseMarketHashName(catalogItem.marketHashName),
      wear: normalizedWear,
    };
  }

  if (catalogItem.catalogSeeded) {
    const baseMarketHashName =
      catalogItem.baseMarketHashName ??
      deriveBaseMarketHashName(catalogItem.marketHashName);
    const variants = await prisma.itemDefinition.findMany({
      where: {
        OR: [
          { id: catalogItem.id },
          { baseMarketHashName },
          { marketHashName: baseMarketHashName },
        ],
      },
      select: { id: true },
    });
    return {
      catalogItem,
      itemDefinitionIds: variants.map((variant) => variant.id),
      baseMarketHashName,
      wear: null,
    };
  }

  return {
    catalogItem,
    itemDefinitionIds: [catalogItem.id],
    baseMarketHashName: catalogItem.baseMarketHashName,
    wear: null,
  };
}
