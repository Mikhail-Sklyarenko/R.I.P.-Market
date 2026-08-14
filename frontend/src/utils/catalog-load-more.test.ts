import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dedupeCatalogItems, mergeCatalogItems } from './catalog-load-more.ts';

describe('catalog-load-more', () => {
  it('appends unique catalog cards', () => {
    const existing = [{ id: 'a', marketHashName: 'A' } as never];
    const incoming = [
      { id: 'a', marketHashName: 'A duplicate' } as never,
      { id: 'b', marketHashName: 'B' } as never,
    ];

    const merged = mergeCatalogItems(existing, incoming);
    assert.equal(merged.length, 2);
    assert.deepEqual(
      merged.map((item) => item.id),
      ['a', 'b'],
    );
  });

  it('dedupes multi-page restore batches', () => {
    const merged = dedupeCatalogItems([
      { id: 'a', marketHashName: 'A' } as never,
      { id: 'b', marketHashName: 'B' } as never,
      { id: 'a', marketHashName: 'A again' } as never,
    ]);

    assert.deepEqual(
      merged.map((item) => item.id),
      ['a', 'b'],
    );
  });
});
