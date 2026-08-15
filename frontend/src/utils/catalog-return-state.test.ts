import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';
import {
  catalogMainGridItemSelector,
  clearCatalogReturnState,
  getCatalogReturnHref,
  hasCatalogReturnState,
  normalizeCatalogSearch,
  parseCatalogLimitParam,
  parseCatalogPageParam,
  peekCatalogReturnState,
  readCatalogReturnRestore,
  rememberCatalogReturnState,
} from './catalog-return-state.ts';

describe('catalog-return-state', () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    globalThis.sessionStorage = {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => {
        storage.set(key, value);
      },
      removeItem: (key) => {
        storage.delete(key);
      },
      clear: () => storage.clear(),
      key: () => null,
      length: 0,
    } as Storage;

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        location: {
          pathname: '/catalog',
          search: '?page=2',
        },
        scrollY: 640,
      },
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'window');
  });

  it('stores anchor item id and restores without clearing early', () => {
    rememberCatalogReturnState('item-42');
    assert.equal(getCatalogReturnHref(), '/catalog?page=2');
    assert.equal(hasCatalogReturnState(), true);
    assert.equal(peekCatalogReturnState()?.anchorItemId, 'item-42');

    const restore = readCatalogReturnRestore();
    assert.deepEqual(restore, { scrollY: 640, anchorItemId: 'item-42' });
    assert.equal(hasCatalogReturnState(), true);

    clearCatalogReturnState();
    assert.equal(readCatalogReturnRestore(), null);
  });

  it('does not restore when catalog query changed', () => {
    rememberCatalogReturnState('item-1');
    window.location.search = '?page=1';

    assert.equal(readCatalogReturnRestore(), null);
    assert.equal(getCatalogReturnHref(), '/catalog?page=2');
  });

  it('treats home and /catalog paths as equivalent for restore', () => {
    window.location.pathname = '/';
    rememberCatalogReturnState('home-item');

    window.location.pathname = '/catalog';
    window.location.search = '?page=2';
    assert.deepEqual(readCatalogReturnRestore(), {
      scrollY: 640,
      anchorItemId: 'home-item',
    });
  });

  it('matches query params regardless of order', () => {
    assert.equal(normalizeCatalogSearch('?b=1&a=2'), normalizeCatalogSearch('?a=2&b=1'));
    window.location.search = '?limit=48&page=2';
    rememberCatalogReturnState('ordered');
    window.location.search = '?page=2&limit=48';
    assert.equal(readCatalogReturnRestore()?.anchorItemId, 'ordered');
  });

  it('builds a main-grid selector for the anchor card', () => {
    assert.equal(
      catalogMainGridItemSelector('abc-123'),
      '[data-testid="catalog-grid"] [data-catalog-item-id="abc-123"]',
    );
  });

  it('parses catalog page query param safely', () => {
    assert.equal(parseCatalogPageParam(null), 1);
    assert.equal(parseCatalogPageParam('2'), 2);
    assert.equal(parseCatalogPageParam('0'), 1);
    assert.equal(parseCatalogPageParam('abc'), 1);
  });

  it('parses catalog limit query param safely', () => {
    assert.equal(parseCatalogLimitParam(null), 48);
    assert.equal(parseCatalogLimitParam('96'), 96);
    assert.equal(parseCatalogLimitParam('24'), 24);
    assert.equal(parseCatalogLimitParam('12'), 48);
    assert.equal(parseCatalogLimitParam('abc'), 48);
  });
});
