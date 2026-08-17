import {
  aggregateBidLevels,
  buildOrderBookSnapshot,
} from './order-book.util';

describe('order-book.util', () => {
  describe('aggregateBidLevels', () => {
    it('groups open quantity by max price descending', () => {
      const levels = aggregateBidLevels([
        { maxPriceMinor: 1100n, quantity: 2, quantityFilled: 0 },
        { maxPriceMinor: 1150n, quantity: 1, quantityFilled: 0 },
        { maxPriceMinor: 1100n, quantity: 3, quantityFilled: 1 },
        { maxPriceMinor: 900n, quantity: 1, quantityFilled: 1 },
        { maxPriceMinor: null, quantity: 1, quantityFilled: 0 },
      ]);

      expect(levels).toEqual([
        { priceMinor: '1150', quantity: 1 },
        { priceMinor: '1100', quantity: 4 },
      ]);
    });
  });

  describe('buildOrderBookSnapshot', () => {
    it('computes spread between best bid and best ask', () => {
      const snapshot = buildOrderBookSnapshot({
        bids: [{ priceMinor: '1100', quantity: 2 }],
        asks: [{ lotId: 'lot-1', priceMinor: '1250', floatValue: null, wear: null }],
        asksCount: 3,
        minAskPriceMinor: 1250n,
      });

      expect(snapshot.bestBidMinor).toBe('1100');
      expect(snapshot.bestAskMinor).toBe('1250');
      expect(snapshot.spreadMinor).toBe('150');
      expect(snapshot.asksSummary).toEqual({
        count: 3,
        minPriceMinor: '1250',
      });
    });
  });
});
