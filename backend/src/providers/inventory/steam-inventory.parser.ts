export type SteamInventoryAsset = {
  appid: number;
  contextid: string;
  assetid: string;
  classid: string;
  instanceid: string;
};

export type SteamInventoryDescription = {
  classid: string;
  instanceid: string;
  market_hash_name?: string;
  market_name?: string;
  type?: string;
  tradable?: number;
  market_tradable_restriction?: number;
  cache_expiration?: string;
  tags?: Array<{ category: string; localized_tag_name?: string }>;
};

export type SteamAssetProperty = {
  propertyid: number;
  float_value?: string;
  int_value?: string;
};

export type SteamAssetProperties = {
  appid: number;
  contextid: string;
  assetid: string;
  asset_properties?: SteamAssetProperty[];
};

export type SteamInventoryResponse = {
  success?: number;
  assets?: SteamInventoryAsset[];
  descriptions?: SteamInventoryDescription[];
  asset_properties?: SteamAssetProperties[];
  more_items?: number;
  last_assetid?: string;
  total_inventory_count?: number;
};

export type ParsedSteamAsset = {
  assetExternalId: string;
  marketHashName: string;
  weapon?: string;
  rarity?: string;
  tradable: boolean;
  tradeLockUntil: Date | null;
  floatValue: string | null;
  paintSeed: number | null;
  wear: string | null;
};

const WEAR_SUFFIX_MAP: Record<string, string> = {
  'factory new': 'FN',
  'minimal wear': 'MW',
  'field-tested': 'FT',
  'well-worn': 'WW',
  'battle-scarred': 'BS',
};

function descriptionKey(classid: string, instanceid: string): string {
  return `${classid}_${instanceid}`;
}

function parseWearFromMarketHashName(marketHashName: string): string | null {
  const match = marketHashName.match(/\(([^)]+)\)\s*$/);
  if (!match?.[1]) {
    return null;
  }
  return WEAR_SUFFIX_MAP[match[1].toLowerCase()] ?? match[1];
}

function parseWeaponFromTags(
  tags?: SteamInventoryDescription['tags'],
): string | undefined {
  const weaponTag = tags?.find((tag) => tag.category === 'Weapon');
  return weaponTag?.localized_tag_name ?? undefined;
}

function parseRarityFromTags(
  tags?: SteamInventoryDescription['tags'],
): string | undefined {
  const rarityTag = tags?.find((tag) => tag.category === 'Rarity');
  return rarityTag?.localized_tag_name ?? undefined;
}

function parseTradeLockUntil(
  description: SteamInventoryDescription,
): Date | null {
  if (description.cache_expiration) {
    const parsed = new Date(description.cache_expiration);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return null;
}

export function parseSteamInventoryResponse(
  body: SteamInventoryResponse,
): ParsedSteamAsset[] {
  const assets = body.assets ?? [];
  const descriptions = body.descriptions ?? [];
  const assetProperties = body.asset_properties ?? [];

  const descriptionByKey = new Map<string, SteamInventoryDescription>();
  for (const description of descriptions) {
    descriptionByKey.set(
      descriptionKey(description.classid, description.instanceid),
      description,
    );
  }

  const propertiesByAssetId = new Map<string, SteamAssetProperty[]>();
  for (const entry of assetProperties) {
    propertiesByAssetId.set(
      entry.assetid,
      entry.asset_properties ?? [],
    );
  }

  const parsed: ParsedSteamAsset[] = [];

  for (const asset of assets) {
    const description = descriptionByKey.get(
      descriptionKey(asset.classid, asset.instanceid),
    );
    if (!description?.market_hash_name) {
      continue;
    }

    const props = propertiesByAssetId.get(asset.assetid) ?? [];
    const floatProp = props.find((prop) => prop.propertyid === 1);
    const seedProp = props.find((prop) => prop.propertyid === 2);

    parsed.push({
      assetExternalId: asset.assetid,
      marketHashName: description.market_hash_name,
      weapon: parseWeaponFromTags(description.tags),
      rarity: parseRarityFromTags(description.tags),
      tradable: description.tradable === 1,
      tradeLockUntil: parseTradeLockUntil(description),
      floatValue: floatProp?.float_value ?? null,
      paintSeed: seedProp?.int_value ? Number(seedProp.int_value) : null,
      wear: parseWearFromMarketHashName(description.market_hash_name),
    });
  }

  return parsed;
}

export function isPrivateInventoryResponse(
  body: SteamInventoryResponse | null | undefined,
  statusCode: number,
): boolean {
  if (statusCode === 403) {
    return true;
  }
  return body?.success === 15;
}

export function isEmptyInventoryResponse(
  body: SteamInventoryResponse | null | undefined,
): boolean {
  return (body?.assets?.length ?? 0) === 0 && body?.success === 1;
}
