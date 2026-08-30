import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isListingRequestCurrent,
  nextListingRequestGeneration,
} from './inventory-listing-request.ts';

describe('inventory-listing-request', () => {
  it('invalidates prior in-flight generations', () => {
    let gen = 0;
    const first = nextListingRequestGeneration(gen);
    gen = first;
    const second = nextListingRequestGeneration(gen);
    gen = second;
    assert.equal(isListingRequestCurrent(first, gen), false);
    assert.equal(isListingRequestCurrent(second, gen), true);
  });
});
