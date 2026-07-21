import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CATALOG_CATEGORY_OPTIONS,
  getCategoryOptionsForTab,
} from './catalog-filters.ts';
import {
  CATALOG_MODEL_PREVIEW_ICON_HASHES,
  getCatalogModelPreviewHash,
} from './catalog-model-preview-icons.ts';

describe('catalog model preview icons', () => {
  it('covers every weapon filter option outside Other', () => {
    const weaponOptions = CATALOG_CATEGORY_OPTIONS.filter(
      (option) => option.value && option.tabId !== 'other' && option.tabId !== 'all',
    );
    assert.ok(weaponOptions.length >= 20);
    for (const option of weaponOptions) {
      const weapon = option.weapon ?? option.value;
      const hash = getCatalogModelPreviewHash(weapon);
      assert.ok(hash, `missing preview hash for ${weapon}`);
      assert.match(hash, /^[A-Za-z0-9_-]+$/);
    }
  });

  it('keeps preview hashes unique per weapon', () => {
    const hashes = Object.values(CATALOG_MODEL_PREVIEW_ICON_HASHES);
    assert.equal(new Set(hashes).size, hashes.length);
  });

  it('includes AUG and FAMAS in rifles dropdown', () => {
    const rifles = getCategoryOptionsForTab('rifles').map((option) => option.value);
    assert.ok(rifles.includes('AUG'));
    assert.ok(rifles.includes('FAMAS'));
    assert.ok(getCatalogModelPreviewHash('AUG'));
    assert.ok(getCatalogModelPreviewHash('FAMAS'));
  });
});
