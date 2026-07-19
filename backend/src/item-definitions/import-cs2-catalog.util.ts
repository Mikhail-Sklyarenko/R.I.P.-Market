import { isListableMarketHashName } from '../lots/listing-eligibility.util';
import {
  collectWearCodeFromName,
  deriveBaseMarketHashName,
  wearCodesFromSteamWearNames,
} from './base-market-hash-name.util';

export const CS2_SKINS_NOT_GROUPED_URL =
  'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/skins_not_grouped.json';

export type Cs2ApiSkinRow = {
  market_hash_name?: string;
  image?: string | null;
  weapon?: { name?: string } | null;
  rarity?: { name?: string } | null;
  wear?: { name?: string } | null;
};

export type CatalogSkinCardSeed = {
  marketHashName: string;
  baseMarketHashName: string;
  weapon: string | null;
  rarity: string | null;
  iconUrl: string | null;
  availableWears: string[];
};

/**
 * Collapse every Steam wear variant into one catalog card per base skin name.
 */
export function buildCatalogSkinCardSeeds(
  rows: Cs2ApiSkinRow[],
): CatalogSkinCardSeed[] {
  const byBase = new Map<string, CatalogSkinCardSeed>();

  for (const row of rows) {
    const marketHashName = row.market_hash_name?.trim();
    if (!marketHashName || !isListableMarketHashName(marketHashName)) {
      continue;
    }

    const base = deriveBaseMarketHashName(marketHashName);
    const wearFromName = collectWearCodeFromName(marketHashName);
    const wearFromField = wearCodesFromSteamWearNames(
      row.wear?.name ? [row.wear.name] : [],
    )[0];
    const wear = wearFromName ?? wearFromField ?? null;

    const existing = byBase.get(base);
    if (!existing) {
      byBase.set(base, {
        marketHashName: base,
        baseMarketHashName: base,
        weapon: row.weapon?.name?.trim() || null,
        rarity: row.rarity?.name?.trim() || null,
        iconUrl: row.image?.trim() || null,
        availableWears: wear ? [wear] : [],
      });
      continue;
    }

    if (wear && !existing.availableWears.includes(wear)) {
      existing.availableWears.push(wear);
    }
    if (!existing.iconUrl && row.image?.trim()) {
      existing.iconUrl = row.image.trim();
    }
    if (!existing.weapon && row.weapon?.name?.trim()) {
      existing.weapon = row.weapon.name.trim();
    }
    if (!existing.rarity && row.rarity?.name?.trim()) {
      existing.rarity = row.rarity.name.trim();
    }
  }

  const WEAR_ORDER = ['FN', 'MW', 'FT', 'WW', 'BS'];
  return [...byBase.values()]
    .map((seed) => ({
      ...seed,
      availableWears: [...seed.availableWears].sort(
        (a, b) => WEAR_ORDER.indexOf(a) - WEAR_ORDER.indexOf(b),
      ),
    }))
    .sort((a, b) => a.marketHashName.localeCompare(b.marketHashName));
}

export type ImportCs2CatalogOptions = {
  offset?: number;
  limit?: number;
  dryRun?: boolean;
};

export type ImportCs2CatalogReport = {
  fetchedRows: number;
  seedCards: number;
  upserted: number;
  offset: number;
  limit: number | null;
  dryRun: boolean;
};

type PrismaItemDefinitionClient = {
  itemDefinition: {
    upsert: (args: {
      where: { marketHashName: string };
      create: {
        game: string;
        marketHashName: string;
        baseMarketHashName: string;
        weapon: string | null;
        rarity: string | null;
        iconUrl: string | null;
        availableWears: string[];
        catalogSeeded: boolean;
      };
      update: {
        baseMarketHashName: string;
        weapon?: string;
        rarity?: string;
        iconUrl?: string;
        availableWears: string[];
        catalogSeeded: boolean;
      };
    }) => Promise<unknown>;
  };
};

export async function importCs2CatalogSeeds(
  prisma: PrismaItemDefinitionClient,
  seeds: CatalogSkinCardSeed[],
  options: ImportCs2CatalogOptions = {},
): Promise<ImportCs2CatalogReport> {
  const offset = Math.max(0, options.offset ?? 0);
  const limit = options.limit ?? null;
  const slice =
    limit === null ? seeds.slice(offset) : seeds.slice(offset, offset + limit);

  let upserted = 0;
  if (!options.dryRun) {
    for (const seed of slice) {
      await prisma.itemDefinition.upsert({
        where: { marketHashName: seed.marketHashName },
        create: {
          game: 'CS2',
          marketHashName: seed.marketHashName,
          baseMarketHashName: seed.baseMarketHashName,
          weapon: seed.weapon,
          rarity: seed.rarity,
          iconUrl: seed.iconUrl,
          availableWears: seed.availableWears,
          catalogSeeded: true,
        },
        update: {
          baseMarketHashName: seed.baseMarketHashName,
          weapon: seed.weapon ?? undefined,
          rarity: seed.rarity ?? undefined,
          ...(seed.iconUrl ? { iconUrl: seed.iconUrl } : {}),
          availableWears: seed.availableWears,
          catalogSeeded: true,
        },
      });
      upserted += 1;
    }
  }

  return {
    fetchedRows: seeds.length,
    seedCards: seeds.length,
    upserted: options.dryRun ? 0 : upserted,
    offset,
    limit,
    dryRun: Boolean(options.dryRun),
  };
}
