import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';
import {
  consumeCatalogScrollRestore,
  getCatalogReturnHref,
  parseCatalogLimitParam,
  parseCatalogPageParam,
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

  it('stores and restores scroll for the same catalog URL', () => {
    rememberCatalogReturnState();
    assert.equal(getCatalogReturnHref(), '/catalog?page=2');

    const scrollY = consumeCatalogScrollRestore();
    assert.equal(scrollY, 640);
    assert.equal(consumeCatalogScrollRestore(), null);
  });

  it('does not restore scroll when catalog query changed', () => {
    rememberCatalogReturnState();
    window.location.search = '?page=1';

    assert.equal(consumeCatalogScrollRestore(), null);
    assert.equal(getCatalogReturnHref(), '/catalog?page=2');
  });

  it('treats home and /catalog paths as equivalent for scroll restore', () => {
    window.location.pathname = '/';
    rememberCatalogReturnState();

    window.location.pathname = '/catalog';
    window.location.search = '?page=2';
    assert.equal(consumeCatalogScrollRestore(), 640);
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
