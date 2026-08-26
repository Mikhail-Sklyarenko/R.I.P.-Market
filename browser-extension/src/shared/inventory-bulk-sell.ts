/**
 * D6: Multi-select / bulk sell from Steam CS2 inventory.
 * Fungible same-name stacks → POST /lots/bulk (2–50).
 * Differentiated skins → sequential POST /lots with progress / partial success.
 */

import type { InventoryItemPlatformFacts } from './inventory-item-enrichment.js';
import { resolveInventorySellAction } from './inventory-one-click-sell.js';

export const MIN_BULK_LISTING_COUNT = 2;
export const MAX_BULK_LISTING_COUNT = 50;

export type BulkSellSteamFacts = {
  assetId: string;
  marketHashName: string | null;
  floatValue: string | null;
  paintSeed: number | null;
  wear: string | null;
  tradable: boolean;
  marketable: boolean;
  tradeLockUntil: string | null;
};

export type BulkSellItem = {
  steamAssetId: string;
  inventoryAssetId: string | null;
  marketHashName: string;
  fungible: boolean;
};

export type BulkSellOperation =
  | {
      type: 'platform_bulk';
      marketHashName: string;
      items: BulkSellItem[];
    }
  | {
      type: 'sequential';
      items: BulkSellItem[];
    };

export type BulkSellPlan = {
  operations: BulkSellOperation[];
  selectedCount: number;
  plannedCount: number;
  truncated: boolean;
  modeLabel: string;
  summaryLine: string;
};

export type BulkSellProgress = {
  total: number;
  done: number;
  created: number;
  failed: number;
  label: string;
};

/** Same rules as backend `isFungibleInventoryAsset` (float/seed/wear block bulk). */
export function isFungibleSteamFacts(
  steam: Pick<BulkSellSteamFacts, 'floatValue' | 'paintSeed' | 'wear'>,
): boolean {
  if (steam.floatValue != null && String(steam.floatValue).trim() !== '') {
    const numeric = Number(steam.floatValue);
    if (Number.isFinite(numeric)) {
      return false;
    }
  }
  if (steam.paintSeed != null && Number.isFinite(steam.paintSeed)) {
    return false;
  }
  if (steam.wear != null && String(steam.wear).trim() !== '') {
    return false;
  }
  return true;
}

export function canSelectForBulkSell(params: {
  connected: boolean;
  steam: Pick<
    BulkSellSteamFacts,
    'tradable' | 'marketable' | 'tradeLockUntil'
  >;
  platform?: InventoryItemPlatformFacts | null;
  nowMs?: number;
}): boolean {
  const action = resolveInventorySellAction({
    connected: params.connected,
    steam: params.steam,
    platform: params.platform,
    nowMs: params.nowMs,
  });
  return action.kind === 'list';
}

export function buildBulkSellItem(params: {
  steam: BulkSellSteamFacts;
  platform?: InventoryItemPlatformFacts | null;
}): BulkSellItem | null {
  const name = params.steam.marketHashName?.trim();
  if (!name) {
    return null;
  }
  return {
    steamAssetId: params.steam.assetId,
    inventoryAssetId: params.platform?.inventoryAssetId ?? null,
    marketHashName: name,
    fungible: isFungibleSteamFacts(params.steam),
  };
}

export function planBulkSellOperations(
  items: BulkSellItem[],
  options?: { maxCount?: number },
): BulkSellPlan {
  const maxCount = options?.maxCount ?? MAX_BULK_LISTING_COUNT;
  const unique = new Map<string, BulkSellItem>();
  for (const item of items) {
    if (!item.steamAssetId || !item.marketHashName) {
      continue;
    }
    unique.set(item.steamAssetId, item);
  }
  const all = [...unique.values()];
  const truncated = all.length > maxCount;
  const selected = truncated ? all.slice(0, maxCount) : all;

  const fungibleGroups = new Map<string, BulkSellItem[]>();
  const sequential: BulkSellItem[] = [];

  for (const item of selected) {
    if (!item.fungible) {
      sequential.push(item);
      continue;
    }
    const group = fungibleGroups.get(item.marketHashName) ?? [];
    group.push(item);
    fungibleGroups.set(item.marketHashName, group);
  }

  const operations: BulkSellOperation[] = [];
  let bulkGroups = 0;
  let sequentialCount = 0;

  for (const [marketHashName, group] of fungibleGroups) {
    if (group.length >= MIN_BULK_LISTING_COUNT) {
      operations.push({
        type: 'platform_bulk',
        marketHashName,
        items: group,
      });
      bulkGroups += 1;
    } else {
      sequential.push(...group);
    }
  }

  if (sequential.length > 0) {
    operations.push({ type: 'sequential', items: sequential });
    sequentialCount = sequential.length;
  }

  const plannedCount = selected.length;
  let modeLabel = 'По одному';
  if (bulkGroups > 0 && sequentialCount === 0) {
    modeLabel = bulkGroups === 1 ? 'Пакет (одинаковые)' : 'Несколько пакетов';
  } else if (bulkGroups > 0 && sequentialCount > 0) {
    modeLabel = 'Пакет + по одному';
  } else if (plannedCount >= MIN_BULK_LISTING_COUNT) {
    modeLabel = 'По одному (разные скины)';
  }

  const parts: string[] = [];
  if (bulkGroups > 0) {
    parts.push(
      bulkGroups === 1
        ? '1 пакет одинаковых'
        : `${bulkGroups} пакета одинаковых`,
    );
  }
  if (sequentialCount > 0) {
    parts.push(`${sequentialCount} по одному`);
  }
  if (truncated) {
    parts.push(`лимит ${maxCount}`);
  }

  return {
    operations,
    selectedCount: all.length,
    plannedCount,
    truncated,
    modeLabel,
    summaryLine:
      parts.length > 0
        ? parts.join(' · ')
        : plannedCount === 1
          ? '1 предмет'
          : `${plannedCount} предметов`,
  };
}

export function validateBulkSelectionForSubmit(count: number): string | null {
  if (count < MIN_BULK_LISTING_COUNT) {
    return `Выберите минимум ${MIN_BULK_LISTING_COUNT} предмета`;
  }
  if (count > MAX_BULK_LISTING_COUNT) {
    return `За один раз — до ${MAX_BULK_LISTING_COUNT} предметов`;
  }
  return null;
}

export function buildBulkProgress(params: {
  total: number;
  done: number;
  created: number;
  failed: number;
}): BulkSellProgress {
  const total = Math.max(0, params.total);
  const done = Math.min(total, Math.max(0, params.done));
  return {
    total,
    done,
    created: params.created,
    failed: params.failed,
    label:
      total === 0
        ? 'Нет предметов'
        : `Выставлено ${params.created} из ${total}${
            params.failed > 0 ? ` · ошибок ${params.failed}` : ''
          }`,
  };
}

export function toggleBulkSelection(
  selected: ReadonlySet<string>,
  assetId: string,
  enabled: boolean,
): Set<string> {
  const next = new Set(selected);
  if (enabled) {
    if (next.size >= MAX_BULK_LISTING_COUNT && !next.has(assetId)) {
      return next;
    }
    next.add(assetId);
  } else {
    next.delete(assetId);
  }
  return next;
}
