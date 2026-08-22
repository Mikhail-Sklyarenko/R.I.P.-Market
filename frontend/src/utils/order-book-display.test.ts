import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { BuyRequest, ItemOrderBook } from '../api/types';
import { excludeOwnBuyRequestsFromOrderBook } from './order-book-display.ts';

const baseOrderBook: ItemOrderBook = {
  itemDefinitionId: 'item-1',
  wear: 'FN',
  bids: [
    { priceMinor: '1200', quantity: 5 },
    { priceMinor: '1000', quantity: 2 },
  ],
  asks: [],
  asksSummary: { count: 0, minPriceMinor: null },
  bestBidMinor: '1200',
  bestAskMinor: null,
  spreadMinor: null,
};

function ownRequest(
  overrides: Partial<BuyRequest> & Pick<BuyRequest, 'id' | 'maxPriceMinor' | 'quantity'>,
): BuyRequest {
  return {
    buyerId: 'buyer-1',
    itemDefinitionId: 'item-1',
    quantityFilled: 0,
    reservedAmountMinor: null,
    status: 'OPEN',
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

describe('excludeOwnBuyRequestsFromOrderBook', () => {
  it('subtracts own quantity from matching bid levels', () => {
    const filtered = excludeOwnBuyRequestsFromOrderBook(baseOrderBook, [
      ownRequest({ id: 'a', maxPriceMinor: '1200', quantity: 2 }),
      ownRequest({ id: 'b', maxPriceMinor: '1000', quantity: 1 }),
    ]);

    assert.deepEqual(filtered.bids, [
      { priceMinor: '1200', quantity: 3 },
      { priceMinor: '1000', quantity: 1 },
    ]);
    assert.equal(filtered.bestBidMinor, '1200');
  });

  it('removes bid levels fully covered by own requests', () => {
    const filtered = excludeOwnBuyRequestsFromOrderBook(baseOrderBook, [
      ownRequest({ id: 'a', maxPriceMinor: '1000', quantity: 2 }),
    ]);

    assert.deepEqual(filtered.bids, [{ priceMinor: '1200', quantity: 5 }]);
    assert.equal(filtered.bestBidMinor, '1200');
  });

  it('returns the same snapshot when there is nothing to exclude', () => {
    const filtered = excludeOwnBuyRequestsFromOrderBook(baseOrderBook, []);
    assert.equal(filtered, baseOrderBook);
  });
});
