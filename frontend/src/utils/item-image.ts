export const STEAM_ITEM_IMAGE_CDN =
  'https://community.cloudflare.steamstatic.com/economy/image';

export const ITEM_IMAGE_PLACEHOLDER_DATA =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='256' height='192' viewBox='0 0 256 192'%3E%3Crect width='256' height='192' fill='%23111827'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%2394a3b8' font-family='system-ui' font-size='14'%3ECS2 Item%3C/text%3E%3C/svg%3E";

export function getSteamItemImageUrl(iconUrl?: string | null): string {
  if (!iconUrl) {
    return ITEM_IMAGE_PLACEHOLDER_DATA;
  }
  const normalized = iconUrl.replace(/^\//, '');
  return `${STEAM_ITEM_IMAGE_CDN}/${normalized}`;
}

export function formatFloatValue(value?: string | number | null): string | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const numeric = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return numeric.toFixed(6);
}

export function formatPaintSeed(value?: number | string | null): string | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const numeric = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return String(Math.trunc(numeric));
}

export type ItemDisplaySource = {
  wear?: string | null;
  floatValue?: string | number | null;
  paintSeed?: number | string | null;
  itemDefinition: {
    marketHashName: string;
    weapon?: string | null;
    rarity?: string | null;
    iconUrl?: string | null;
  };
};

export function getItemCategory(item: ItemDisplaySource): string | null {
  return item.itemDefinition.weapon ?? item.itemDefinition.rarity ?? null;
}
