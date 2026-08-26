import {
  aggregateAskLevels,
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

  describe('aggregateAskLevels', () => {
    it('groups sell lots by price ascending', () => {
      expect(
        aggregateAskLevels([
          { priceMinor: 100n },
          { priceMinor: 115n },
          { priceMinor: 100n },
          { priceMinor: 100n },
          { priceMinor: 130n },
        ]),
      ).toEqual([
        { priceMinor: '100', quantity: 3 },
        { priceMinor: '115', quantity: 1 },
        { priceMinor: '130', quantity: 1 },
      ]);
    });
  });

  describe('buildOrderBookSnapshot', () => {
    it('computes spread between best bid and best ask', () => {
      const snapshot = buildOrderBookSnapshot({
        bids: [{ priceMinor: '1100', quantity: 2 }],
        asks: [{ lotId: 'lot-1', priceMinor: '1250', floatValue: null, wear: null }],
        asksLevels: [{ priceMinor: '1250', quantity: 3 }],
        asksCount: 3,
        minAskPriceMinor: 1250n,
      });

      expect(snapshot.bestBidMinor).toBe('1100');
      expect(snapshot.bestAskMinor).toBe('1250');
      expect(snapshot.spreadMinor).toBe('150');
      expect(snapshot.asksLevels).toEqual([{ priceMinor: '1250', quantity: 3 }]);
      expect(snapshot.asksSummary).toEqual({
        count: 3,
        minPriceMinor: '1250',
      });
    });
  });
});
