import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatWearFloatDisplay,
  formatWearPercent,
  getWearPointerPercent,
  getWearTierKey,
  parseWearFloat,
} from './wear-bar.ts';

describe('wear-bar utils', () => {
  it('parses numeric and string float values', () => {
    assert.equal(parseWearFloat(0.529655), 0.529655);
    assert.equal(parseWearFloat('0.529655'), 0.529655);
    assert.equal(parseWearFloat(''), null);
    assert.equal(parseWearFloat(1.2), null);
  });

  it('formats float display and percent', () => {
    assert.equal(formatWearFloatDisplay(0.529655), '0.529655');
    assert.equal(formatWearFloatDisplay(0.06999993), '0.06999993');
    assert.equal(formatWearPercent(0.529655), '52.97%');
  });

  it('maps pointer position across the bar', () => {
    assert.equal(getWearPointerPercent(0), 0);
    assert.equal(getWearPointerPercent(0.529655), 52.9655);
    assert.equal(getWearPointerPercent(1), 100);
  });

  it('resolves wear tier from float', () => {
    assert.equal(getWearTierKey(0.03), 'FN');
    assert.equal(getWearTierKey(0.1), 'MW');
    assert.equal(getWearTierKey(0.2), 'FT');
    assert.equal(getWearTierKey(0.4), 'WW');
    assert.equal(getWearTierKey(0.529655), 'BS');
  });
});
