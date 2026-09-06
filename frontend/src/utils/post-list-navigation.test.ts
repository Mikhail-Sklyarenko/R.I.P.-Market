import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildInventoryListedPath,
  parseInventoryListedSuccess,
  stripListedSuccessParams,
} from './post-list-navigation.ts';

describe('post-list-navigation', () => {
  it('keeps sellers on inventory with listed success query', () => {
    assert.equal(buildInventoryListedPath(1), '/sell/inventory?listed=1');
    assert.equal(
      buildInventoryListedPath(3),
      '/sell/inventory?listed=1&listedCount=3',
    );
  });

  it('parses listed success from inventory URL', () => {
    assert.deepEqual(
      parseInventoryListedSuccess(new URLSearchParams('listed=1')),
      { quantity: 1 },
    );
    assert.deepEqual(
      parseInventoryListedSuccess(
        new URLSearchParams('listed=1&listedCount=4'),
      ),
      { quantity: 4 },
    );
    assert.equal(
      parseInventoryListedSuccess(new URLSearchParams('tab=listings')),
      null,
    );
  });

  it('strips listed success params without touching others', () => {
    const next = stripListedSuccessParams(
      new URLSearchParams('listed=1&listedCount=2&q=ak'),
    );
    assert.equal(next.get('listed'), null);
    assert.equal(next.get('listedCount'), null);
    assert.equal(next.get('q'), 'ak');
  });
});
