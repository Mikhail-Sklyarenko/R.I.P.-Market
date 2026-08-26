import { describe, expect, it } from 'vitest';
import {
  buildInventorySellPreview,
  findPlatformAssetIdByExternalId,
  formatUsdInputFromMinor,
  parseUsdInputToMinor,
  resolveBidListOffer,
  resolveDefaultListPriceMinor,
  resolveInventorySellAction,
  siteListingsUrl,
  siteLotUrl,
  validateCreateLotPriceMinor,
} from './inventory-one-click-sell.js';

describe('inventory-one-click-sell', () => {
  const steamOk = {
    tradable: true,
    marketable: true,
    tradeLockUntil: null as string | null,
  };

  it('gates sell action by connection and safety', () => {
    expect(
      resolveInventorySellAction({ connected: false, steam: steamOk }).kind,
    ).toBe('pair');

    expect(
      resolveInventorySellAction({
        connected: true,
        steam: steamOk,
        platform: {
          listed: true,
          lotId: 'lot-1',
          listedPriceMinor: '1000',
          lotUrl: 'https://p2pcs.ru/lots/lot-1',
          inActiveDeal: false,
          hasActiveTradeTask: false,
          assetStatus: 'LISTED',
          orderId: null,
          orderUrl: null,
          inventoryAssetId: 'uuid-1',
        },
      }),
    ).toMatchObject({ kind: 'manage', label: 'Управлять', lotId: 'lot-1' });

    expect(
      resolveInventorySellAction({
        connected: true,
        steam: steamOk,
        platform: {
          listed: false,
          lotId: null,
          listedPriceMinor: null,
          lotUrl: null,
          inActiveDeal: true,
          hasActiveTradeTask: false,
          assetStatus: 'RESERVED',
          orderId: 'ord-1',
          orderUrl: 'https://p2pcs.ru/orders/ord-1',
          inventoryAssetId: 'uuid-1',
        },
      }).kind,
    ).toBe('blocked');

    expect(
      resolveInventorySellAction({
        connected: true,
        steam: steamOk,
        platform: {
          listed: false,
          lotId: null,
          listedPriceMinor: null,
          lotUrl: null,
          inActiveDeal: false,
          hasActiveTradeTask: true,
          assetStatus: 'AVAILABLE',
          orderId: 'ord-2',
          orderUrl: 'https://p2pcs.ru/orders/ord-2',
          inventoryAssetId: 'uuid-2',
        },
      }),
    ).toMatchObject({
      kind: 'blocked',
      blockReason: 'active_trade_task',
    });

    expect(
      resolveInventorySellAction({
        connected: true,
        steam: {
          ...steamOk,
          tradeLockUntil: '2099-01-01T00:00:00.000Z',
        },
      }).blockReason,
    ).toBe('trade_locked');

    expect(
      resolveInventorySellAction({
        connected: true,
        steam: { ...steamOk, tradable: false },
      }).blockReason,
    ).toBe('not_tradable');

    expect(
      resolveInventorySellAction({ connected: true, steam: steamOk }).kind,
    ).toBe('list');
  });

  it('parses usd input and builds commission preview', () => {
    expect(parseUsdInputToMinor('12.50')).toBe(1250);
    expect(parseUsdInputToMinor('12,50')).toBe(1250);
    expect(parseUsdInputToMinor('0')).toBeNull();
    expect(formatUsdInputFromMinor(1900)).toBe('19.00');

    const preview = buildInventorySellPreview(2000);
    expect(preview).toMatchObject({
      priceMinor: 2000,
      commissionMinor: 100,
      sellerReceiveMinor: 1900,
    });
    expect(preview?.receiveLine).toContain('$19.00');
    expect(validateCreateLotPriceMinor(null)).toMatch(/цену/i);
    expect(validateCreateLotPriceMinor(100)).toBeNull();
  });

  it('resolves default list price from bid or Steam−5%', () => {
    expect(
      resolveDefaultListPriceMinor({
        steamPriceMinor: 2000,
        bestBidMinor: '1500',
      }),
    ).toBe(1500);
    expect(resolveDefaultListPriceMinor({ steamPriceMinor: 2000 })).toBe(1900);
    expect(resolveDefaultListPriceMinor(null)).toBeNull();
  });

  it('offers honest list-at-bid when buy-side demand exists', () => {
    const none = resolveBidListOffer({ steamPriceMinor: 2000 });
    expect(none.available).toBe(false);
    expect(none.honestyLine).toMatch(/не моментальная/i);

    const bid = resolveBidListOffer({
      steamPriceMinor: 2000,
      bestBidMinor: '1600',
      bestBidQuantity: 3,
    });
    expect(bid.available).toBe(true);
    expect(bid.priceMinor).toBe(1600);
    expect(bid.buttonLabel).toContain('$16.00');
    expect(bid.hintLine).toMatch(/bid/i);
  });

  it('maps steam assetExternalId to platform inventory UUID', () => {
    expect(
      findPlatformAssetIdByExternalId(
        [
          { id: 'uuid-a', assetExternalId: '111' },
          { id: 'uuid-b', assetExternalId: '222' },
        ],
        '222',
      ),
    ).toBe('uuid-b');
    expect(findPlatformAssetIdByExternalId([], '222')).toBeNull();
  });

  it('builds site deep links', () => {
    expect(siteLotUrl('https://p2pcs.ru/', 'lot-9')).toBe(
      'https://p2pcs.ru/lots/lot-9',
    );
    expect(siteListingsUrl('https://p2pcs.ru')).toContain(
      '/deals?tab=listings',
    );
  });
});
