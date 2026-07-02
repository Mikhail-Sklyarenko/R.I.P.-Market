import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  filterInventoryAssets,
  filterSellerLots,
  formatLotStatus,
  computeSellerPendingReceiveMinor,
} from './seller-flow.ts';

describe('seller-flow utils', () => {
  it('formats lot status labels in Russian', () => {
    assert.equal(formatLotStatus('ACTIVE'), 'Активен');
    assert.equal(formatLotStatus('UNKNOWN'), 'UNKNOWN');
  });

  it('filters inventory assets by status and search', () => {
    const assets = [
      {
        status: 'AVAILABLE',
        itemDefinition: { marketHashName: 'AK-47 | Redline' },
      },
      {
        status: 'LISTED',
        itemDefinition: { marketHashName: 'AWP | Asiimov' },
      },
    ];

    assert.equal(
      filterInventoryAssets(assets, 'ak', 'AVAILABLE').length,
      1,
    );
    assert.equal(
      filterInventoryAssets(assets, '', 'LISTED').length,
      1,
    );
  });

  it('filters seller lots by status and search', () => {
    const lots = [
      {
        status: 'ACTIVE',
        inventoryAsset: { itemDefinition: { marketHashName: 'AK-47 | Redline' } },
      },
      {
        status: 'SOLD',
        inventoryAsset: { itemDefinition: { marketHashName: 'AWP | Asiimov' } },
      },
    ];

    assert.equal(filterSellerLots(lots, 'awp', 'all').length, 1);
    assert.equal(filterSellerLots(lots, '', 'SOLD').length, 1);
  });

  it('sums seller receive for active seller orders', () => {
    const total = computeSellerPendingReceiveMinor(
      [
        {
          sellerId: 'seller-1',
          status: 'WAITING_TRADE',
          lot: { sellerReceiveMinor: '500' },
        },
        {
          sellerId: 'seller-1',
          status: 'COMPLETED',
          lot: { sellerReceiveMinor: '300' },
        },
      ],
      'seller-1',
    );

    assert.equal(total, 500);
  });
});
