import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Mirror backend aggregation for regression safety if logic is duplicated later.
function aggregateBidLevels(
  requests: Array<{
    maxPriceMinor: bigint | null;
    quantity: number;
    quantityFilled: number;
  }>,
) {
  const levels = new Map<string, number>();
  for (const request of requests) {
    if (request.maxPriceMinor == null || request.maxPriceMinor <= 0n) {
      continue;
    }
    const remaining = request.quantity - request.quantityFilled;
    if (remaining <= 0) {
      continue;
    }
    const key = request.maxPriceMinor.toString();
    levels.set(key, (levels.get(key) ?? 0) + remaining);
  }
  return [...levels.entries()]
    .map(([priceMinor, quantity]) => ({ priceMinor, quantity }))
    .sort((left, right) => Number(BigInt(right.priceMinor) - BigInt(left.priceMinor)));
}

describe('order book bid aggregation', () => {
  it('merges quantity at the same price level', () => {
    const levels = aggregateBidLevels([
      { maxPriceMinor: 1200n, quantity: 2, quantityFilled: 0 },
      { maxPriceMinor: 1200n, quantity: 1, quantityFilled: 0 },
      { maxPriceMinor: 1100n, quantity: 1, quantityFilled: 0 },
    ]);

    assert.deepEqual(levels, [
      { priceMinor: '1200', quantity: 3 },
      { priceMinor: '1100', quantity: 1 },
    ]);
  });
});
