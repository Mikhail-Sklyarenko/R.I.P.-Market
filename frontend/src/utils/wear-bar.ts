export const WEAR_TIERS = [
  { key: 'FN', label: 'FN', min: 0, max: 0.07 },
  { key: 'MW', label: 'MW', min: 0.07, max: 0.15 },
  { key: 'FT', label: 'FT', min: 0.15, max: 0.38 },
  { key: 'WW', label: 'WW', min: 0.38, max: 0.45 },
  { key: 'BS', label: 'BS', min: 0.45, max: 1 },
] as const;

export function parseWearFloat(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const numeric = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 1) {
    return null;
  }
  return numeric;
}

export function formatWearFloatDisplay(value: number): string {
  return value.toFixed(6);
}

export function formatWearPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

export function getWearPointerPercent(value: number): number {
  return Math.min(100, Math.max(0, value * 100));
}

export function getWearTierKey(value: number): (typeof WEAR_TIERS)[number]['key'] | null {
  for (const tier of WEAR_TIERS) {
    if (value >= tier.min && (tier.key === 'BS' ? value <= tier.max : value < tier.max)) {
      return tier.key;
    }
  }
  return null;
}
