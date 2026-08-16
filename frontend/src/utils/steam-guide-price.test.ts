import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isCredibleSteamGuidePrice } from './steam-guide-price.ts';

describe('isCredibleSteamGuidePrice', () => {
  it('rejects null/zero steam', () => {
    assert.equal(isCredibleSteamGuidePrice(null, 1000), false);
    assert.equal(isCredibleSteamGuidePrice(0, 1000), false);
  });

  it('rejects absurdly low steam vs listing ($0.01 vs $10)', () => {
    assert.equal(isCredibleSteamGuidePrice(1, 1000), false);
    assert.equal(isCredibleSteamGuidePrice(1, '1000'), false);
  });

  it('accepts nearby steam guide', () => {
    assert.equal(isCredibleSteamGuidePrice(850, 1000), true);
    assert.equal(isCredibleSteamGuidePrice(1200, 1000), true);
  });

  it('rejects wild outliers above listing', () => {
    assert.equal(isCredibleSteamGuidePrice(50_000, 1000), false);
  });
});
