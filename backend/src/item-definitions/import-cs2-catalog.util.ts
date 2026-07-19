import { isListableMarketHashName } from '../lots/listing-eligibility.util';
import {
  collectWearCodeFromName,
  deriveBaseMarketHashName,
  wearCodesFromSteamWearNames,
} from './base-market-hash-name.util';

export const CS2_API_BASE_URL =
  'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en';

/** @deprecated Prefer CS2_CATALOG_SOURCES — kept for callers that only import skins. */
export const CS2_SKINS_NOT_GROUPED_URL = `${CS2_API_BASE_URL}/skins_not_grouped.json`;

export type Cs2CatalogSourceKind =
  | 'skin'
  | 'sticker'
  | 'sticker_slab'
  | 'charm'
  | 'patch'
  | 'crate'
  | 'agent'
  | 'graffiti'
  | 'music_kit'
  | 'key'
  | 'collectible'
  | 'tool'
  | 'highlight';

export type Cs2CatalogSource = {
  id: Cs2CatalogSourceKind;
  url: string;
  /** Stored on ItemDefinition.weapon for filtering / display. */
  weaponLabel: string | null;
  /** Collapse wear suffixes into one card (weapon skins only). */
  groupWear: boolean;
  /** When market_hash_name is missing, fall back to display name. */
  allowNameFallback: boolean;
};

/**
 * Full listable CS2 catalog sources from ByMykel CSGO-API.
 * Skins keep wear grouping; everything else is one Steam market name = one card.
 */
export const CS2_CATALOG_SOURCES: readonly Cs2CatalogSource[] = [
  {
    id: 'skin',
    url: `${CS2_API_BASE_URL}/skins_not_grouped.json`,
    weaponLabel: null,
    groupWear: true,
    allowNameFallback: false,
  },
  {
    id: 'sticker',
    url: `${CS2_API_BASE_URL}/stickers.json`,
    weaponLabel: 'Sticker',
    groupWear: false,
    allowNameFallback: true,
  },
  {
    id: 'sticker_slab',
    url: `${CS2_API_BASE_URL}/sticker_slabs.json`,
    weaponLabel: 'Sticker Slab',
    groupWear: false,
    allowNameFallback: true,
  },
  {
    id: 'charm',
    url: `${CS2_API_BASE_URL}/keychains.json`,
    weaponLabel: 'Charm',
    groupWear: false,
    allowNameFallback: true,
  },
  {
    id: 'patch',
    url: `${CS2_API_BASE_URL}/patches.json`,
    weaponLabel: 'Patch',
    groupWear: false,
    allowNameFallback: true,
  },
  {
    id: 'crate',
    url: `${CS2_API_BASE_URL}/crates.json`,
    weaponLabel: 'Crate',
    groupWear: false,
    allowNameFallback: true,
  },
  {
    id: 'agent',
    url: `${CS2_API_BASE_URL}/agents.json`,
    weaponLabel: 'Agent',
    groupWear: false,
    allowNameFallback: true,
  },
  {
    id: 'graffiti',
    url: `${CS2_API_BASE_URL}/graffiti.json`,
    weaponLabel: 'Graffiti',
    groupWear: false,
    allowNameFallback: true,
  },
  {
    id: 'music_kit',
    url: `${CS2_API_BASE_URL}/music_kits.json`,
    weaponLabel: 'Music Kit',
    groupWear: false,
    allowNameFallback: false,
  },
  {
    id: 'key',
    url: `${CS2_API_BASE_URL}/keys.json`,
    weaponLabel: 'Key',
    groupWear: false,
    allowNameFallback: false,
  },
  {
    id: 'collectible',
    url: `${CS2_API_BASE_URL}/collectibles.json`,
    weaponLabel: 'Collectible',
    groupWear: false,
    allowNameFallback: false,
  },
  {
    id: 'tool',
    url: `${CS2_API_BASE_URL}/tools.json`,
    weaponLabel: 'Tool',
    groupWear: false,
    allowNameFallback: true,
  },
  {
    id: 'highlight',
    url: `${CS2_API_BASE_URL}/highlights.json`,
    weaponLabel: 'Charm',
    groupWear: false,
    allowNameFallback: true,
  },
] as const;

export type Cs2ApiCatalogRow = {
  market_hash_name?: string | null;
  name?: string | null;
  image?: string | null;
  marketable?: boolean | null;
  type?: string | null;
  weapon?: { name?: string } | null;
  rarity?: { name?: string } | null;
  wear?: { name?: string } | null;
};

/** @deprecated Use Cs2ApiCatalogRow */
export type Cs2ApiSkinRow = Cs2ApiCatalogRow;

export type CatalogSkinCardSeed = {
  marketHashName: string;
  baseMarketHashName: string;
  weapon: string | null;
  rarity: string | null;
  iconUrl: string | null;
  availableWears: string[];
  sourceKind?: Cs2CatalogSourceKind;
};

const WEAR_ORDER = ['FN', 'MW', 'FT', 'WW', 'BS'];

export function resolveCatalogMarketHashName(
  row: Cs2ApiCatalogRow,
  allowNameFallback: boolean,
): string | null {
  const fromMarket = row.market_hash_name?.trim();
  if (fromMarket) {
    return fromMarket;
  }
  if (!allowNameFallback) {
    return null;
  }
  const fromName = row.name?.trim();
  return fromName || null;
}

function resolveWeaponLabel(
  row: Cs2ApiCatalogRow,
  source: Cs2CatalogSource,
): string | null {
  if (source.groupWear) {
    return row.weapon?.name?.trim() || null;
  }
  if (source.id === 'crate') {
    const crateType = row.type?.trim();
    if (crateType) {
      return crateType;
    }
  }
  return source.weaponLabel;
}

/**
 * Collapse every Steam wear variant into one catalog card per base skin name.
 */
export function buildCatalogSkinCardSeeds(
  rows: Cs2ApiCatalogRow[],
): CatalogSkinCardSeed[] {
  return buildCatalogCardSeeds(rows, CS2_CATALOG_SOURCES[0]!);
}

export function buildCatalogCardSeeds(
  rows: Cs2ApiCatalogRow[],
  source: Cs2CatalogSource,
): CatalogSkinCardSeed[] {
  const byKey = new Map<string, CatalogSkinCardSeed>();

  for (const row of rows) {
    if (row.marketable === false) {
      continue;
    }

    const marketHashName = resolveCatalogMarketHashName(
      row,
      source.allowNameFallback,
    );
    if (!marketHashName || !isListableMarketHashName(marketHashName)) {
      continue;
    }

    const cardKey = source.groupWear
      ? deriveBaseMarketHashName(marketHashName)
      : marketHashName;

    const wearFromName = source.groupWear
      ? collectWearCodeFromName(marketHashName)
      : null;
    const wearFromField = source.groupWear
      ? wearCodesFromSteamWearNames(
          row.wear?.name ? [row.wear.name] : [],
        )[0]
      : null;
    const wear = wearFromName ?? wearFromField ?? null;
    const weapon = resolveWeaponLabel(row, source);

    const existing = byKey.get(cardKey);
    if (!existing) {
      byKey.set(cardKey, {
        marketHashName: cardKey,
        baseMarketHashName: cardKey,
        weapon,
        rarity: row.rarity?.name?.trim() || null,
        iconUrl: row.image?.trim() || null,
        availableWears: wear ? [wear] : [],
        sourceKind: source.id,
      });
      continue;
    }

    if (wear && !existing.availableWears.includes(wear)) {
      existing.availableWears.push(wear);
    }
    if (!existing.iconUrl && row.image?.trim()) {
      existing.iconUrl = row.image.trim();
    }
    if (!existing.weapon && weapon) {
      existing.weapon = weapon;
    }
    if (!existing.rarity && row.rarity?.name?.trim()) {
      existing.rarity = row.rarity.name.trim();
    }
  }

  return [...byKey.values()]
    .map((seed) => ({
      ...seed,
      availableWears: [...seed.availableWears].sort(
        (a, b) => WEAR_ORDER.indexOf(a) - WEAR_ORDER.indexOf(b),
      ),
    }))
    .sort((a, b) => a.marketHashName.localeCompare(b.marketHashName));
}

/**
 * Merge cards from multiple sources. First write wins for identity; later sources
 * only fill missing icon/weapon/rarity and union available wears.
 */
export function mergeCatalogCardSeeds(
  batches: CatalogSkinCardSeed[][],
): CatalogSkinCardSeed[] {
  const byName = new Map<string, CatalogSkinCardSeed>();

  for (const batch of batches) {
    for (const seed of batch) {
      const existing = byName.get(seed.marketHashName);
      if (!existing) {
        byName.set(seed.marketHashName, {
          ...seed,
          availableWears: [...seed.availableWears],
        });
        continue;
      }
      for (const wear of seed.availableWears) {
        if (!existing.availableWears.includes(wear)) {
          existing.availableWears.push(wear);
        }
      }
      if (!existing.iconUrl && seed.iconUrl) {
        existing.iconUrl = seed.iconUrl;
      }
      if (!existing.weapon && seed.weapon) {
        existing.weapon = seed.weapon;
      }
      if (!existing.rarity && seed.rarity) {
        existing.rarity = seed.rarity;
      }
    }
  }

  return [...byName.values()]
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
  bySource?: Record<string, number>;
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
