const WEAR_ICON_CODES = new Set(['FN', 'MW', 'FT', 'WW', 'BS']);

export function parseWearIcons(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const icons: Record<string, string> = {};
  for (const [wear, iconUrl] of Object.entries(value)) {
    if (!WEAR_ICON_CODES.has(wear)) {
      continue;
    }
    if (typeof iconUrl !== 'string') {
      continue;
    }
    const trimmed = iconUrl.trim();
    if (trimmed) {
      icons[wear] = trimmed;
    }
  }
  return icons;
}

export function mergeWearIcons(
  ...maps: Array<Record<string, string> | undefined | null>
): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const map of maps) {
    if (!map) {
      continue;
    }
    for (const [wear, iconUrl] of Object.entries(map)) {
      const trimmed = iconUrl.trim();
      if (trimmed) {
        merged[wear] = trimmed;
      }
    }
  }
  return merged;
}

export function resolveWearIconUrl(
  wearIcons: Record<string, string> | undefined | null,
  wear: string | null | undefined,
  fallbackIconUrl?: string | null,
): string | null {
  const code = wear?.trim().toUpperCase();
  if (code && wearIcons?.[code]?.trim()) {
    return wearIcons[code].trim();
  }
  const fallback = fallbackIconUrl?.trim();
  return fallback || null;
}
