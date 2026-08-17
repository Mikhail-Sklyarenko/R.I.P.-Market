import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CatalogItem } from '../api/types.ts';
import {
  catalogSessionCoversPages,
  clearCatalogSession,
  readCatalogSession,
  sliceCatalogSessionItems,
  writeCatalogSession,
  type CatalogSessionSnapshot,
} from './catalog-session-cache.ts';

function item(id: string): CatalogItem {
  return {
    id,
    slug: id,
    marketHashName: id,
    weapon: 'Rifle',
    rarity: 'Covert',
    iconUrl: null,
    wearIcons: {},
    availableWears: [],
    catalogSeeded: true,
    minMarketplacePriceMinor: null,
    activeLotCount: 0,
    latestListedAt: null,
    orderCount30d: 0,
    steamPriceMinor: null,
    buffPriceMinor: null,
    csfloatPriceMinor: null,
    featuredLotId: null,
  } as CatalogItem;
}

function snapshot(
  overrides: Partial<CatalogSessionSnapshot> = {},
): CatalogSessionSnapshot {
  return {
    queryKey: 'q1',
    items: [item('a'), item('b'), item('c')],
    total: 3,
    steamPrices: {},
    steamPriceFetchedAt: null,
    loadedPage: 1,
    pageLimit: 2,
    popularItems: [],
    savedAt: Date.now(),
    ...overrides,
  };
}

describe('catalog-session-cache', () => {
  it('covers loaded pages when enough items are cached', () => {
    const cached = snapshot({ items: [item('a'), item('b'), item('c')], total: 3, pageLimit: 2 });
    assert.equal(catalogSessionCoversPages(cached, 1, 2), true);
    assert.equal(catalogSessionCoversPages(cached, 2, 2), true);
    assert.equal(catalogSessionCoversPages(cached, 2, 48), false);
  });

  it('slices items for the requested page window', () => {
    const cached = snapshot({ pageLimit: 2 });
    assert.deepEqual(
      sliceCatalogSessionItems(cached, 1, 2).map((entry) => entry.id),
      ['a', 'b'],
    );
  });

  it('round-trips a snapshot in memory', () => {
    clearCatalogSession();
    writeCatalogSession(snapshot());
    const restored = readCatalogSession('q1');
    assert.ok(restored);
    assert.equal(restored?.items.length, 3);
    clearCatalogSession();
  });
});
