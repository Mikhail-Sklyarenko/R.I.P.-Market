import type { Lot, OrderBookAskPreview } from '../api/types.ts';
import { parseWearCodeFromMarketHashName } from './catalog-lot-display.ts';
import { resolveLotDisplayItem } from './lot-display.ts';

/**
 * Market taxonomy for item pages.
 *
 * Fungible: price/qty market (cases, keys, many collectibles) — no float/wear UX.
 * Differentiated: unique or wear-based assets — float, stickers, offer selection.
 */

export type ItemMarketKind = 'fungible' | 'differentiated';

export type ItemMarketInput = {
  weapon?: string | null;
  marketHashName?: string | null;
  availableWears?: string[] | null;
};

export type ItemMarketTraits = {
  marketKind: ItemMarketKind;
  supportsWear: boolean;
  supportsFloat: boolean;
  supportsStickers: boolean;
};

export type ItemOffersColumns = {
  showFloat: boolean;
  showStickers: boolean;
};

/** ItemDefinition.weapon labels that never carry CS float / exterior. */
const NO_FLOAT_WEAPONS = new Set(
  [
    'Case',
    'Terminal',
    'Crate',
    'Sticker',
    'Sticker Slab',
    'Sticker Capsule',
    'Patch',
    'Patch Capsule',
    'Autograph Capsule',
    'Graffiti',
    'Charm',
    'Agent',
    'Music Kit',
    'Music Kit Box',
    'Key',
    'Tool',
    'Collectible',
    'Souvenir',
  ].map((value) => value.toLowerCase()),
);

function normalizeWeapon(weapon?: string | null): string {
  return (weapon ?? '').trim().toLowerCase();
}

export function isNoFloatWeapon(weapon?: string | null): boolean {
  const normalized = normalizeWeapon(weapon);
  return normalized.length > 0 && NO_FLOAT_WEAPONS.has(normalized);
}

export function itemSupportsWear(input: ItemMarketInput): boolean {
  if ((input.availableWears?.length ?? 0) > 0) {
    return true;
  }
  return Boolean(parseWearCodeFromMarketHashName(input.marketHashName ?? ''));
}

/**
 * Float is meaningful for wear-based skins/knives/gloves.
 * Known non-wear weapons never show float UX, even if a lot row is empty.
 */
export function itemSupportsFloat(input: ItemMarketInput): boolean {
  if (itemSupportsWear(input)) {
    return true;
  }
  if (isNoFloatWeapon(input.weapon)) {
    return false;
  }
  // Unknown non-wear catalog rows (packages, oddities): prefer clean UI over "—".
  return false;
}

/** Applied stickers belong on weapon skins, not on cases/keys/etc. */
export function itemSupportsStickers(input: ItemMarketInput): boolean {
  return itemSupportsWear(input);
}

export function resolveItemMarketTraits(input: ItemMarketInput): ItemMarketTraits {
  const supportsWear = itemSupportsWear(input);
  const supportsFloat = itemSupportsFloat(input);
  const supportsStickers = itemSupportsStickers(input);
  const marketKind: ItemMarketKind =
    supportsWear || supportsFloat ? 'differentiated' : 'fungible';

  return {
    marketKind,
    supportsWear,
    supportsFloat,
    supportsStickers,
  };
}

export function lotHasFloatValue(lot: Lot): boolean {
  const display = resolveLotDisplayItem(lot);
  if (display.floatValue === null || display.floatValue === undefined || display.floatValue === '') {
    return false;
  }
  const numeric = Number(display.floatValue);
  return Number.isFinite(numeric);
}

export function lotHasStickers(lot: Lot): boolean {
  const display = resolveLotDisplayItem(lot);
  return (display.stickers?.length ?? 0) > 0;
}

export function askHasFloatValue(ask: Pick<OrderBookAskPreview, 'floatValue'>): boolean {
  return ask.floatValue != null && Number.isFinite(ask.floatValue);
}

/**
 * Column visibility for offers / order-book asks.
 * Taxonomy decides the default; live lot evidence can only *add* columns
 * (never hide float on a Redline that somehow lacks availableWears).
 */
export function resolveItemOffersColumns(
  input: ItemMarketInput,
  lots: Lot[] = [],
): ItemOffersColumns {
  const traits = resolveItemMarketTraits(input);
  return {
    showFloat: traits.supportsFloat || lots.some(lotHasFloatValue),
    showStickers: traits.supportsStickers || lots.some(lotHasStickers),
  };
}

export function resolveOrderBookAskFloatVisibility(
  input: ItemMarketInput,
  asks: Array<Pick<OrderBookAskPreview, 'floatValue'>> = [],
): boolean {
  const traits = resolveItemMarketTraits(input);
  return traits.supportsFloat || asks.some(askHasFloatValue);
}
