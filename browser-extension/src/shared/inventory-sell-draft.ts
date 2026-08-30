/**
 * T6: Persist Steam inventory sell draft for the current browser tab.
 * Survives Steam/F5 reload of the same tab; cleared when the tab closes
 * (sessionStorage) or the user clears selection.
 */

export const INVENTORY_SELL_DRAFT_KEY = 'rip:inventorySellDraft:v1';

export type InventorySellDraft = {
  version: 1;
  /** SteamID64 when known — ignore restore on account mismatch. */
  steamId: string | null;
  bulkMode: boolean;
  selectedAssetIds: string[];
  /** Last price typed in the single-item sell panel (USD string). */
  priceInput: string | null;
  /** Asset the priceInput applies to. */
  priceAssetId: string | null;
  updatedAt: number;
};

export type InventorySellDraftStorage = Pick<
  Storage,
  'getItem' | 'setItem' | 'removeItem'
>;

const MAX_SELECTED = 50;

export function createEmptyInventorySellDraft(
  steamId: string | null = null,
): InventorySellDraft {
  return {
    version: 1,
    steamId,
    bulkMode: false,
    selectedAssetIds: [],
    priceInput: null,
    priceAssetId: null,
    updatedAt: Date.now(),
  };
}

export function normalizeInventorySellDraft(
  raw: unknown,
): InventorySellDraft | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const value = raw as Record<string, unknown>;
  if (value.version !== 1) {
    return null;
  }
  const selectedRaw = Array.isArray(value.selectedAssetIds)
    ? value.selectedAssetIds
    : [];
  const selectedAssetIds = [
    ...new Set(
      selectedRaw
        .filter((id): id is string => typeof id === 'string' && id.trim() !== '')
        .map((id) => id.trim())
        .slice(0, MAX_SELECTED),
    ),
  ];
  const steamId =
    typeof value.steamId === 'string' && /^\d{17}$/.test(value.steamId)
      ? value.steamId
      : null;
  const priceInput =
    typeof value.priceInput === 'string' && value.priceInput.trim() !== ''
      ? value.priceInput.trim()
      : null;
  const priceAssetId =
    typeof value.priceAssetId === 'string' && value.priceAssetId.trim() !== ''
      ? value.priceAssetId.trim()
      : null;
  const updatedAt =
    typeof value.updatedAt === 'number' && Number.isFinite(value.updatedAt)
      ? value.updatedAt
      : Date.now();

  return {
    version: 1,
    steamId,
    bulkMode: value.bulkMode === true,
    selectedAssetIds,
    priceInput,
    priceAssetId,
    updatedAt,
  };
}

export function readInventorySellDraft(
  storage: InventorySellDraftStorage = sessionStorage,
): InventorySellDraft | null {
  try {
    const raw = storage.getItem(INVENTORY_SELL_DRAFT_KEY);
    if (!raw) {
      return null;
    }
    return normalizeInventorySellDraft(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function writeInventorySellDraft(
  draft: InventorySellDraft,
  storage: InventorySellDraftStorage = sessionStorage,
): void {
  try {
    const normalized = normalizeInventorySellDraft({
      ...draft,
      updatedAt: Date.now(),
    });
    if (!normalized) {
      return;
    }
    storage.setItem(INVENTORY_SELL_DRAFT_KEY, JSON.stringify(normalized));
  } catch {
    // private mode / quota
  }
}

export function clearInventorySellDraft(
  storage: InventorySellDraftStorage = sessionStorage,
): void {
  try {
    storage.removeItem(INVENTORY_SELL_DRAFT_KEY);
  } catch {
    // ignore
  }
}

/**
 * Restore only assets that still exist on the page; drop stale ids.
 */
export function filterDraftSelectionToKnownAssets(
  selectedAssetIds: readonly string[],
  knownAssetIds: ReadonlySet<string>,
): string[] {
  return selectedAssetIds.filter((id) => knownAssetIds.has(id));
}

export type InventorySellDraftRestoreView = {
  restored: boolean;
  bulkMode: boolean;
  selectedAssetIds: string[];
  priceInput: string | null;
  priceAssetId: string | null;
  chipLabel: string | null;
};

export function resolveInventorySellDraftRestore(params: {
  draft: InventorySellDraft | null;
  pageSteamId: string | null;
  knownAssetIds: ReadonlySet<string>;
}): InventorySellDraftRestoreView {
  const empty: InventorySellDraftRestoreView = {
    restored: false,
    bulkMode: false,
    selectedAssetIds: [],
    priceInput: null,
    priceAssetId: null,
    chipLabel: null,
  };

  const draft = params.draft;
  if (!draft) {
    return empty;
  }
  if (
    draft.steamId &&
    params.pageSteamId &&
    draft.steamId !== params.pageSteamId
  ) {
    return empty;
  }

  const selectedAssetIds = filterDraftSelectionToKnownAssets(
    draft.selectedAssetIds,
    params.knownAssetIds,
  );
  const priceAssetId =
    draft.priceAssetId && params.knownAssetIds.has(draft.priceAssetId)
      ? draft.priceAssetId
      : null;
  const priceInput = priceAssetId ? draft.priceInput : null;
  const bulkMode = draft.bulkMode && selectedAssetIds.length > 0;
  const restored = bulkMode || selectedAssetIds.length > 0 || priceInput != null;

  if (!restored) {
    return empty;
  }

  const chipLabel =
    selectedAssetIds.length > 0
      ? `Восстановлено · выбрано ${selectedAssetIds.length}`
      : priceInput
        ? 'Восстановлен черновик цены'
        : null;

  return {
    restored: true,
    bulkMode,
    selectedAssetIds,
    priceInput,
    priceAssetId,
    chipLabel,
  };
}
