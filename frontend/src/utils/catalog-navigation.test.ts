import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getCatalogBuyPath,
  getCatalogItemPath,
  resolveSingleLotId,
  shouldRedirectItemPageToLot,
} from './catalog-navigation.ts';

describe('catalog-navigation', () => {
  it('routes single-offer catalog items directly to the lot page', () => {
    const item = {
      id: 'item-1',
      activeLotCount: 1,
      featuredLotId: 'lot-1',
    };

    assert.equal(getCatalogItemPath(item), '/lots/lot-1');
    assert.equal(getCatalogBuyPath(item), '/lots/lot-1');
    assert.equal(shouldRedirectItemPageToLot(item, 1), true);
    assert.equal(resolveSingleLotId(item, [{ id: 'lot-1' }]), 'lot-1');
  });

  it('keeps multi-offer items on the comparison page', () => {
    const item = {
      id: 'item-2',
      activeLotCount: 3,
      featuredLotId: 'lot-a',
    };

    assert.equal(getCatalogItemPath(item), '/catalog/items/item-2');
    assert.equal(getCatalogBuyPath(item), '/lots/lot-a');
    assert.equal(shouldRedirectItemPageToLot(item, 3), false);
  });
});
