import type {
  InventoryAsset,
  InventoryPriceHint,
  InventoryPriceHintsResponse,
} from '../api/types';
import { canListAsset } from './seller-flow.ts';

/** Must stay ≤ backend InventoryPriceHintsDto ArrayMaxSize. */
export const INVENTORY_PRICE_HINTS_MAX_NAMES = 60;
export const INVENTORY_PRICE_HINTS_REFRESH_BATCH = 8;

export function chunkStrings(values: string[], size: number): string[][] {
  if (size < 1) {
    return values.length ? [values] : [];
  }
  const chunks: string[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

export function uniqueMarketHashNames(
  assets: Array<{ itemDefinition?: { marketHashName?: string } }>,
): string[] {
  return [
    ...new Set(
      assets
        .map((asset) => asset.itemDefinition?.marketHashName)
        .filter((name): name is string => Boolean(name)),
    ),
  ];
}

export function namesMissingSteamPrice(
  names: string[],
  hints: Record<string, InventoryPriceHint | undefined>,
): string[] {
  return names.filter((name) => {
    const minor = hints[name]?.steamPriceMinor;
    return minor == null || minor <= 0;
  });
}

export function listableNamesMissingSteamPrice(
  assets: InventoryAsset[],
  reportedMissing: string[],
): string[] {
  const listable = new Set(
    uniqueMarketHashNames(assets.filter((asset) => canListAsset(asset))),
  );
  return [...new Set(reportedMissing)].filter((name) => listable.has(name));
}

export function mergeInventoryPriceHintResponses(
  parts: InventoryPriceHintsResponse[],
): InventoryPriceHintsResponse {
  const hints: Record<string, InventoryPriceHint> = {};
  const reportedMissing = new Set<string>();
  let steamPriceFetchedAt: string | null = null;

  for (const part of parts) {
    Object.assign(hints, part.hints);
    for (const name of part.steamPriceMissing ?? []) {
      reportedMissing.add(name);
    }
    if (
      part.steamPriceFetchedAt &&
      (!steamPriceFetchedAt || part.steamPriceFetchedAt > steamPriceFetchedAt)
    ) {
      steamPriceFetchedAt = part.steamPriceFetchedAt;
    }
  }

  return {
    hints,
    steamPriceFetchedAt,
    steamPriceMissing: [...reportedMissing].filter(
      (name) => namesMissingSteamPrice([name], hints).length > 0,
    ),
  };
}

export function hasAnySteamPrice(
  hints: Record<string, InventoryPriceHint | undefined>,
): boolean {
  return Object.values(hints).some(
    (hint) => hint?.steamPriceMinor != null && hint.steamPriceMinor > 0,
  );
}

export async function fetchInventoryPriceHintsInChunks(
  names: string[],
  fetchChunk: (chunk: string[]) => Promise<InventoryPriceHintsResponse>,
  chunkSize: number,
  options?: { parallel?: boolean },
): Promise<{
  response: InventoryPriceHintsResponse;
  okCount: number;
  failCount: number;
  lastError: unknown;
}> {
  const unique = [...new Set(names.filter(Boolean))];
  if (unique.length === 0) {
    return {
      response: { hints: {}, steamPriceFetchedAt: null, steamPriceMissing: [] },
      okCount: 0,
      failCount: 0,
      lastError: null,
    };
  }

  const chunks = chunkStrings(unique, chunkSize);
  const parts: InventoryPriceHintsResponse[] = [];
  let failCount = 0;
  let lastError: unknown = null;

  if (options?.parallel) {
    const results = await Promise.allSettled(chunks.map((chunk) => fetchChunk(chunk)));
    for (const result of results) {
      if (result.status === 'fulfilled') {
        parts.push(result.value);
      } else {
        failCount += 1;
        lastError = result.reason;
      }
    }
  } else {
    for (const chunk of chunks) {
      try {
        parts.push(await fetchChunk(chunk));
      } catch (error) {
        failCount += 1;
        lastError = error;
      }
    }
  }

  return {
    response: mergeInventoryPriceHintResponses(parts),
    okCount: parts.length,
    failCount,
    lastError,
  };
}
