import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatBuyRequestCreatedAge } from './buy-request-display.ts';

describe('formatBuyRequestCreatedAge', () => {
  it('returns just now for very recent requests', () => {
    const createdAt = new Date(Date.now() - 30_000).toISOString();
    assert.equal(formatBuyRequestCreatedAge(createdAt, 'ru'), 'только что');
  });

  it('returns minutes ago for recent requests', () => {
    const createdAt = new Date(Date.now() - 5 * 60_000).toISOString();
    assert.match(formatBuyRequestCreatedAge(createdAt, 'ru') ?? '', /5 мин назад/);
  });
});
