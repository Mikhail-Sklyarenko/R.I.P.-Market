import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getCatalogBuyPath,
  getCatalogItemPath,
  resolveSingleLotId,
} from './catalog-navigation.ts';

describe('catalog-navigation', () => {
  it('keeps single-offer catalog items on the named item page', () => {
    const item = {
      id: 'item-1',
      slug: 'p250-plum-netting-minimal-wear',
      activeLotCount: 1,
      featuredLotId: 'lot-1',
    };

    assert.equal(
      getCatalogItemPath(item),
      '/catalog/items/p250-plum-netting-minimal-wear',
    );
    assert.equal(getCatalogBuyPath(item), '/lots/lot-1');
    assert.equal(resolveSingleLotId(item, [{ id: 'lot-1' }]), 'lot-1');
  });

  it('keeps multi-offer items on the comparison page', () => {
    const item = {
      id: 'item-2',
      slug: 'ak-47-redline',
      activeLotCount: 3,
      featuredLotId: 'lot-a',
    };

    assert.equal(getCatalogItemPath(item), '/catalog/items/ak-47-redline');
    assert.equal(getCatalogBuyPath(item), '/lots/lot-a');
  });

  it('falls back to id when slug is missing', () => {
    const item = {
      id: 'item-2',
      activeLotCount: 3,
      featuredLotId: 'lot-a',
    };

    assert.equal(getCatalogItemPath(item), '/catalog/items/item-2');
  });
});
