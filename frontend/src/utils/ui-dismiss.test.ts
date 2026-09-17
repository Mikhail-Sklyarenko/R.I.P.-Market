import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import {
  clearUiDismissed,
  isUiDismissed,
  markUiDismissed,
} from './ui-dismiss.ts';

const memory = new Map<string, string>();

describe('ui-dismiss', () => {
  beforeEach(() => {
    memory.clear();
    (globalThis as { localStorage?: Storage }).localStorage = {
      getItem: (k: string) => memory.get(k) ?? null,
      setItem: (k: string, v: string) => {
        memory.set(k, v);
      },
      removeItem: (k: string) => {
        memory.delete(k);
      },
      clear: () => memory.clear(),
      key: () => null,
      length: 0,
    };
  });

  it('marks permanent dismiss', () => {
    assert.equal(isUiDismissed('k'), false);
    markUiDismissed('k');
    assert.equal(isUiDismissed('k'), true);
    clearUiDismissed('k');
    assert.equal(isUiDismissed('k'), false);
  });

  it('honors TTL expiry', () => {
    markUiDismissed('k', { ttlMs: 1 });
    assert.equal(isUiDismissed('k', { ttlMs: 1 }), true);
    // Force expire by rewriting older timestamp
    memory.set('k', JSON.stringify({ at: Date.now() - 10_000, ttlMs: 1 }));
    assert.equal(isUiDismissed('k'), false);
  });

  it('accepts legacy "1" flag', () => {
    memory.set('legacy', '1');
    assert.equal(isUiDismissed('legacy'), true);
  });
});
