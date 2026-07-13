import {
  lotMatchesBuyRequestPrice,
  shouldNotifyBuyRequestMatch,
} from './buy-request-matching.util';

describe('buy-request matching util', () => {
  it('matches lot price within max price', () => {
    expect(
      lotMatchesBuyRequestPrice({ maxPriceMinor: 1000n }, { priceMinor: 900n }),
    ).toBe(true);
    expect(
      lotMatchesBuyRequestPrice({ maxPriceMinor: 1000n }, { priceMinor: 1000n }),
    ).toBe(true);
    expect(
      lotMatchesBuyRequestPrice({ maxPriceMinor: 1000n }, { priceMinor: 1001n }),
    ).toBe(false);
  });

  it('notifies on first match and on cheaper relist', () => {
    const request = {
      id: 'req-1',
      buyerId: 'buyer-1',
      maxPriceMinor: null,
      lastNotifiedLotId: null,
      lastNotifiedPriceMinor: null,
    };
    const lot = {
      id: 'lot-1',
      sellerId: 'seller-1',
      priceMinor: 1200n,
      itemDefinitionId: 'item-1',
    };

    expect(shouldNotifyBuyRequestMatch(request, lot)).toBe(true);

    const afterFirst = {
      ...request,
      lastNotifiedLotId: 'lot-1',
      lastNotifiedPriceMinor: 1200n,
    };
    expect(
      shouldNotifyBuyRequestMatch(afterFirst, {
        ...lot,
        id: 'lot-1',
      }),
    ).toBe(false);
    expect(
      shouldNotifyBuyRequestMatch(afterFirst, {
        ...lot,
        id: 'lot-2',
        priceMinor: 1300n,
      }),
    ).toBe(false);
    expect(
      shouldNotifyBuyRequestMatch(afterFirst, {
        ...lot,
        id: 'lot-2',
        priceMinor: 1000n,
      }),
    ).toBe(true);
    expect(
      shouldNotifyBuyRequestMatch(request, {
        ...lot,
        sellerId: 'buyer-1',
      }),
    ).toBe(false);
  });
});
