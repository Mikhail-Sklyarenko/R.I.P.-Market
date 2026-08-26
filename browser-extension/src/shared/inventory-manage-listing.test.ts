import { describe, expect, it } from 'vitest';
import {
  buildManagePricePreview,
  formatListedPriceInput,
  formatManageCurrentPriceLine,
  hasPriceChanged,
  resolveManageListingAction,
} from './inventory-manage-listing.js';

describe('inventory-manage-listing', () => {
  const listedPlatform = {
    inventoryAssetId: 'uuid-1',
    assetStatus: 'LISTED',
    listed: true,
    lotId: 'lot-1',
    listedPriceMinor: '1250',
    lotUrl: 'https://p2pcs.ru/lots/lot-1',
    inActiveDeal: false,
    hasActiveTradeTask: false,
    orderId: null,
    orderUrl: null,
  };

  it('resolves manage action for ACTIVE listing', () => {
    const action = resolveManageListingAction({
      connected: true,
      platform: listedPlatform,
    });
    expect(action.kind).toBe('manage');
    expect(action.label).toBe('Управлять');
    expect(action.lotId).toBe('lot-1');
    expect(action.listedPriceMinor).toBe(1250);
  });

  it('blocks manage when lot is in an active deal', () => {
    const action = resolveManageListingAction({
      connected: true,
      platform: {
        ...listedPlatform,
        inActiveDeal: true,
        orderId: 'ord-1',
        orderUrl: 'https://p2pcs.ru/orders/ord-1',
      },
    });
    expect(action.kind).toBe('in_deal');
    expect(action.message).toMatch(/сделке/i);
  });

  it('returns none when not listed or disconnected', () => {
    expect(
      resolveManageListingAction({ connected: false, platform: listedPlatform })
        .kind,
    ).toBe('none');
    expect(
      resolveManageListingAction({
        connected: true,
        platform: { ...listedPlatform, listed: false, lotId: null },
      }).kind,
    ).toBe('none');
  });

  it('formats price input and detects changes', () => {
    expect(formatListedPriceInput(1250)).toBe('12.50');
    expect(formatManageCurrentPriceLine(1250)).toContain('$12.50');
    expect(hasPriceChanged(1250, 1300)).toBe(true);
    expect(hasPriceChanged(1250, 1250)).toBe(false);

    const preview = buildManagePricePreview('20.00');
    expect(preview.priceMinor).toBe(2000);
    expect(preview.preview?.sellerReceiveMinor).toBe(1900);
    expect(buildManagePricePreview('0').error).toBeTruthy();
  });
});
