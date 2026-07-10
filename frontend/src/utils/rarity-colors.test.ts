import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CATALOG_RARITY_FILTERS,
  getRarityStyle,
} from './rarity-colors.ts';

describe('rarity-colors utils', () => {
  it('maps known Steam rarities to color and glow', () => {
    assert.equal(getRarityStyle('Covert').color, '#eb4b4b');
    assert.match(getRarityStyle('Covert').glow, /235,\s*75,\s*75/);

    assert.equal(getRarityStyle('Consumer Grade').color, '#b0c3d9');
    assert.equal(getRarityStyle('Industrial Grade').color, '#5e98d9');
    assert.equal(getRarityStyle('Classified').color, '#d32ce6');
    assert.equal(getRarityStyle('Restricted').color, '#8847ff');
    assert.equal(getRarityStyle('Mil-Spec Grade').color, '#4b69ff');
    assert.equal(getRarityStyle('Mil-Spec').color, '#4b69ff');
    assert.equal(getRarityStyle('Contraband').color, '#e4ae39');
    assert.equal(getRarityStyle('Extraordinary').color, '#e4ae39');
  });

  it('returns fallback style for unknown or empty rarity', () => {
    assert.equal(getRarityStyle('Unknown Rarity').color, '#64748b');
    assert.equal(getRarityStyle(null).color, '#64748b');
    assert.equal(getRarityStyle('').color, '#64748b');
  });

  it('exposes catalog rarity filter options', () => {
    assert.ok(CATALOG_RARITY_FILTERS.some((option) => option.value === 'Covert'));
    assert.ok(CATALOG_RARITY_FILTERS.some((option) => option.value === 'Extraordinary'));
  });
});
