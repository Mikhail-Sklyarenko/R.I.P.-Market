import { describe, expect, it } from 'vitest';
import {
  clearInventorySellDraft,
  createEmptyInventorySellDraft,
  filterDraftSelectionToKnownAssets,
  normalizeInventorySellDraft,
  readInventorySellDraft,
  resolveInventorySellDraftRestore,
  writeInventorySellDraft,
} from './inventory-sell-draft.js';

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    key() {
      return null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
  };
}

describe('inventory-sell-draft', () => {
  it('round-trips draft through session storage', () => {
    const storage = memoryStorage();
    writeInventorySellDraft(
      {
        ...createEmptyInventorySellDraft('76561198000000000'),
        bulkMode: true,
        selectedAssetIds: ['a1', 'a2'],
        priceInput: '12.50',
        priceAssetId: 'a1',
      },
      storage,
    );
    const read = readInventorySellDraft(storage);
    expect(read?.bulkMode).toBe(true);
    expect(read?.selectedAssetIds).toEqual(['a1', 'a2']);
    expect(read?.priceInput).toBe('12.50');
    clearInventorySellDraft(storage);
    expect(readInventorySellDraft(storage)).toBeNull();
  });

  it('rejects invalid payloads', () => {
    expect(normalizeInventorySellDraft(null)).toBeNull();
    expect(normalizeInventorySellDraft({ version: 2 })).toBeNull();
  });

  it('filters selection to known assets and builds restore chip', () => {
    expect(
      filterDraftSelectionToKnownAssets(['a', 'b', 'c'], new Set(['a', 'c'])),
    ).toEqual(['a', 'c']);

    const view = resolveInventorySellDraftRestore({
      draft: {
        version: 1,
        steamId: '76561198000000000',
        bulkMode: true,
        selectedAssetIds: ['gone', 'keep'],
        priceInput: '9.00',
        priceAssetId: 'keep',
        updatedAt: 1,
      },
      pageSteamId: '76561198000000000',
      knownAssetIds: new Set(['keep']),
    });
    expect(view.restored).toBe(true);
    expect(view.selectedAssetIds).toEqual(['keep']);
    expect(view.bulkMode).toBe(true);
    expect(view.chipLabel).toMatch(/выбрано 1/i);
  });

  it('ignores draft from another Steam account', () => {
    const view = resolveInventorySellDraftRestore({
      draft: {
        version: 1,
        steamId: '76561198000000000',
        bulkMode: true,
        selectedAssetIds: ['a'],
        priceInput: null,
        priceAssetId: null,
        updatedAt: 1,
      },
      pageSteamId: '76561198111111111',
      knownAssetIds: new Set(['a']),
    });
    expect(view.restored).toBe(false);
  });
});
