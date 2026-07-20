import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  catalogCardImageWrapClass,
  resolveCatalogCardImageProfile,
} from './catalog-card-image.ts';

describe('catalog-card-image utils', () => {
  it('maps catalog weapon labels to image profiles', () => {
    assert.equal(
      resolveCatalogCardImageProfile({
        weapon: 'Agent',
        marketHashName: '3rd Commando Company | KSK',
      }),
      'tall',
    );
    assert.equal(
      resolveCatalogCardImageProfile({
        weapon: 'Crate',
        marketHashName: '2020 RMR Legends',
      }),
      'square',
    );
    assert.equal(
      resolveCatalogCardImageProfile({
        weapon: 'AK-47',
        marketHashName: 'AK-47 | Asiimov',
      }),
      'default',
    );
  });

  it('builds image wrap class names', () => {
    assert.equal(catalogCardImageWrapClass('default'), 'catalog-lot-card-image-wrap');
    assert.equal(
      catalogCardImageWrapClass('tall'),
      'catalog-lot-card-image-wrap catalog-lot-card-image-wrap--tall',
    );
  });
});
