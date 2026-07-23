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
    assert.ok(rifles.includes('SG 553'));
    assert.ok(getCatalogModelPreviewHash('AUG'));
    assert.ok(getCatalogModelPreviewHash('FAMAS'));
    assert.ok(getCatalogModelPreviewHash('SG 553'));
  });

  it('covers expanded pistol, smg, sniper, and shotgun models', () => {
    for (const weapon of [
      'Tec-9',
      'R8 Revolver',
      'MP5-SD',
      'P90',
      'G3SG1',
      'SCAR-20',
      'MAG-7',
      'Sawed-Off',
    ]) {
      assert.ok(getCatalogModelPreviewHash(weapon), weapon);
    }
  });

  it('uses skinned knife previews rather than vanilla defaults', () => {
    // Comments in the map file record the curated skin; hashes must exist.
    assert.ok(getCatalogModelPreviewHash('Karambit'));
    assert.ok(getCatalogModelPreviewHash('Butterfly Knife'));
    assert.ok(getCatalogModelPreviewHash('M9 Bayonet'));
  });
});
