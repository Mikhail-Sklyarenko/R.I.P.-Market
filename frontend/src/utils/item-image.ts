export const STEAM_ITEM_IMAGE_CDN =
  'https://community.cloudflare.steamstatic.com/economy/image';

export const ITEM_IMAGE_PLACEHOLDER_DATA =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='256' height='192' viewBox='0 0 256 192'%3E%3Crect width='256' height='192' fill='%23111827'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%2394a3b8' font-family='system-ui' font-size='14'%3EПредмет CS2%3C/text%3E%3C/svg%3E";

export type SteamItemImageOptions = {
  /** Steam CDN thumbnail size, e.g. 64 → `/64fx64f`. */
  sizePx?: number;
};

export function getSteamItemImageUrl(
  iconUrl?: string | null,
  options?: SteamItemImageOptions,
): string {
  const trimmed = iconUrl?.trim();
  if (!trimmed) {
    return ITEM_IMAGE_PLACEHOLDER_DATA;
  }
  if (trimmed.startsWith('data:')) {
    return trimmed;
  }

  const sizePx = options?.sizePx;
  const sizeSuffix =
    typeof sizePx === 'number' && Number.isFinite(sizePx) && sizePx > 0
      ? `/${Math.round(sizePx)}fx${Math.round(sizePx)}f`
      : '';

  if (/^https?:\/\//i.test(trimmed)) {
    if (!sizeSuffix || /\/\d+fx\d+f(?:\/|$)/i.test(trimmed)) {
      return trimmed;
    }
    return `${trimmed.replace(/\/$/, '')}${sizeSuffix}`;
  }

  const normalized = trimmed.replace(/^\//, '').replace(/\/$/, '');
  return `${STEAM_ITEM_IMAGE_CDN}/${normalized}${sizeSuffix}`;
}

/** Prefer listing snapshot icon, then live item definition. */
export function resolveDisplayIconUrl(
  primary?: string | null,
  fallback?: string | null,
): string | null {
  const first = primary?.trim();
  if (first) {
    return first;
  }
  const second = fallback?.trim();
  return second || null;
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

import { getRarityDisplayLabel } from './rarity-colors.ts';

export function getItemCategory(item: ItemDisplaySource): string | null {
  if (item.itemDefinition.weapon?.trim()) {
    return item.itemDefinition.weapon.trim();
  }
  return getRarityDisplayLabel(item.itemDefinition.rarity);
}
