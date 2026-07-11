export const WEAR_TIERS = [
  { key: 'FN', min: 0, max: 0.07 },
  { key: 'MW', min: 0.07, max: 0.15 },
  { key: 'FT', min: 0.15, max: 0.38 },
  { key: 'WW', min: 0.38, max: 0.45 },
  { key: 'BS', min: 0.45, max: 1 },
] as const;

export type WearTierKey = (typeof WEAR_TIERS)[number]['key'];

export function parseFloatValue(
  value: string | number | { toString(): string } | null | undefined,
): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const numeric =
    typeof value === 'string' || typeof value === 'number'
      ? Number(value)
      : Number(value.toString());
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 1) {
    return null;
  }
  return numeric;
}

export function getWearTierKey(floatValue: number): WearTierKey | null {
  for (const tier of WEAR_TIERS) {
    if (
      floatValue >= tier.min &&
      (tier.key === 'BS' ? floatValue <= tier.max : floatValue < tier.max)
    ) {
      return tier.key;
    }
  }
  return null;
}

export function getWearTierBounds(key: WearTierKey): { min: number; max: number } {
  const tier = WEAR_TIERS.find((entry) => entry.key === key);
  return tier ? { min: tier.min, max: tier.max } : { min: 0, max: 1 };
}

export function floatDistance(a: number, b: number): number {
  return Math.abs(a - b);
}
