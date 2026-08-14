import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getCatalogItemRef, isUuid } from './item-slug.ts';

describe('item-slug', () => {
  it('detects UUID refs', () => {
    assert.equal(isUuid('550e8400-e29b-41d4-a716-446655440000'), true);
    assert.equal(isUuid('ak-47-redline'), false);
  });

  it('prefers slug over id for catalog URLs', () => {
    assert.equal(
      getCatalogItemRef({
        id: '550e8400-e29b-41d4-a716-446655440000',
        slug: 'ak-47-redline',
      }),
      'ak-47-redline',
    );
    assert.equal(
      getCatalogItemRef({ id: '550e8400-e29b-41d4-a716-446655440000' }),
      '550e8400-e29b-41d4-a716-446655440000',
    );
  });
});
