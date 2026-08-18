import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveItemPageMode } from './item-page-mode.ts';

describe('item-page-mode', () => {
  it('maps market depth to the correct page mode', () => {
    assert.equal(resolveItemPageMode(0), 'buy-request');
    assert.equal(resolveItemPageMode(1), 'single-listing');
    assert.equal(resolveItemPageMode(2), 'comparison');
    assert.equal(resolveItemPageMode(12), 'comparison');
  });
});
