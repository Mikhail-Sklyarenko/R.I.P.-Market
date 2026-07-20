const WEAR_ICON_CODES = new Set(['FN', 'MW', 'FT', 'WW', 'BS']);

const WEAR_INPUT_TO_CODE: Record<string, string> = {
  fn: 'FN',
  mw: 'MW',
  ft: 'FT',
  ww: 'WW',
  bs: 'BS',
  'factory new': 'FN',
  'minimal wear': 'MW',
  'field-tested': 'FT',
  'well-worn': 'WW',
  'battle-scarred': 'BS',
};

function normalizeWearCode(wear?: string | null): string | null {
  if (!wear?.trim()) {
    return null;
  }
  return WEAR_INPUT_TO_CODE[wear.trim().toLowerCase()] ?? null;
}

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

export function resolveWearIconUrl(
  wearIcons: Record<string, string> | undefined | null,
  wear: string | null | undefined,
  fallbackIconUrl?: string | null,
): string | null {
  const code = normalizeWearCode(wear);
  if (code && wearIcons?.[code]?.trim()) {
    return wearIcons[code].trim();
  }
  const fallback = fallbackIconUrl?.trim();
  return fallback || null;
}

export function preloadWearIcons(
  wearIcons: Record<string, string> | undefined | null,
  toImageUrl: (iconUrl: string) => string,
): void {
  if (!wearIcons || typeof window === 'undefined') {
    return;
  }
  for (const iconUrl of Object.values(wearIcons)) {
    const trimmed = iconUrl.trim();
    if (!trimmed) {
      continue;
    }
    const image = new Image();
    image.src = toImageUrl(trimmed);
  }
}
