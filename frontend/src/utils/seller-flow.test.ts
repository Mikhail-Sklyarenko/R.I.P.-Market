import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  canEditListedAsset,
  canListAsset,
  canOpenInventorySellPanel,
  filterInventoryAssets,
  filterSellerLots,
  formatLotStatus,
  computeSellerPendingReceiveMinor,
  getBulkListableSiblings,
  groupInventoryAssetsForDisplay,
  sortInventoryAssets,
  sortInventoryAssetsBySteamPriceDesc,
} from './seller-flow.ts';

describe('seller-flow utils', () => {
  it('formats lot status labels in Russian', () => {
    assert.equal(formatLotStatus('ACTIVE'), 'Активен');
    assert.equal(formatLotStatus('UNKNOWN'), 'UNKNOWN');
  });

  it('allows editing LISTED assets with an active lot id', () => {
    const listed = {
      status: 'LISTED',
      tradable: true,
      activeLotId: 'lot-1',
      itemDefinition: { marketHashName: 'AK-47 | Redline' },
    };
    assert.equal(canListAsset(listed), false);
    assert.equal(canEditListedAsset(listed), true);
    assert.equal(canOpenInventorySellPanel(listed), true);

    assert.equal(
      canEditListedAsset({ status: 'LISTED', activeLotId: null }),
      false,
    );
    assert.equal(
      canEditListedAsset({ status: 'RESERVED', activeLotId: 'lot-2' }),
      false,
    );
  });

  it('filters inventory assets by status and search', () => {
    const assets = [
      {
        status: 'AVAILABLE',
        tradable: true,
        itemDefinition: { marketHashName: 'AK-47 | Redline' },
      },
      {
        status: 'LISTED',
        tradable: true,
        itemDefinition: { marketHashName: 'AWP | Asiimov' },
      },
      {
        status: 'AVAILABLE',
        tradable: false,
        itemDefinition: { marketHashName: 'Sticker | Capsule' },
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
    assert.equal(filterInventoryAssets(assets, '', 'all').length, 2);
    assert.equal(filterInventoryAssets(assets, '', 'all', true).length, 3);
  });

  it('sorts inventory assets by Steam price (card primary)', () => {
    const assets = [
      {
        status: 'AVAILABLE',
        tradable: true,
        itemDefinition: { marketHashName: 'AK-47 | Redline (Field-Tested)' },
      },
      {
        status: 'AVAILABLE',
        tradable: true,
        itemDefinition: { marketHashName: 'UMP-45 | Green Swirl (Field-Tested)' },
      },
      {
        status: 'AVAILABLE',
        tradable: true,
        itemDefinition: { marketHashName: 'AWP | Asiimov (Field-Tested)' },
      },
      {
        status: 'AVAILABLE',
        tradable: true,
        itemDefinition: { marketHashName: 'Glock-18 | Water Elemental (Field-Tested)' },
      },
    ];
    const priceHints = {
      'AK-47 | Redline (Field-Tested)': { steamPriceMinor: 2500 },
      // Outlier market lot must not affect sort — Steam is $0.03.
      'UMP-45 | Green Swirl (Field-Tested)': {
        steamPriceMinor: 3,
        minMarketplacePriceMinor: '1000',
      },
      'AWP | Asiimov (Field-Tested)': { steamPriceMinor: 9900 },
      'Glock-18 | Water Elemental (Field-Tested)': { steamPriceMinor: 450 },
    };

    const sorted = sortInventoryAssetsBySteamPriceDesc(assets, priceHints);

    assert.deepEqual(
      sorted.map((asset) => asset.itemDefinition.marketHashName),
      [
        'AWP | Asiimov (Field-Tested)',
        'AK-47 | Redline (Field-Tested)',
        'Glock-18 | Water Elemental (Field-Tested)',
        'UMP-45 | Green Swirl (Field-Tested)',
      ],
    );

    assert.deepEqual(
      sortInventoryAssets(assets, priceHints, 'price-asc').map(
        (asset) => asset.itemDefinition.marketHashName,
      ),
      [
        'UMP-45 | Green Swirl (Field-Tested)',
        'Glock-18 | Water Elemental (Field-Tested)',
        'AK-47 | Redline (Field-Tested)',
        'AWP | Asiimov (Field-Tested)',
      ],
    );
  });

  it('keeps assets without prices at the end for price sorts', () => {
    const assets = [
      {
        itemDefinition: { marketHashName: 'No Price Skin' },
      },
      {
        itemDefinition: { marketHashName: 'Cheap Skin' },
      },
      {
        itemDefinition: { marketHashName: 'Pricey Skin' },
      },
    ];
    const priceHints = {
      'Cheap Skin': { steamPriceMinor: 100 },
      'Pricey Skin': { steamPriceMinor: 5000 },
    };

    assert.deepEqual(
      sortInventoryAssets(assets, priceHints, 'price-desc').map(
        (asset) => asset.itemDefinition.marketHashName,
      ),
      ['Pricey Skin', 'Cheap Skin', 'No Price Skin'],
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

  it('finds bulk-listable siblings for identical cases only', () => {
    const caseA = {
      id: 'case-1',
      status: 'AVAILABLE',
      tradable: true,
      floatValue: null,
      paintSeed: null,
      wear: null,
      stickers: null,
      itemDefinition: { marketHashName: 'Revolution Case' },
    };
    const caseB = {
      ...caseA,
      id: 'case-2',
    };
    const skin = {
      id: 'skin-1',
      status: 'AVAILABLE',
      tradable: true,
      floatValue: '0.12',
      paintSeed: 42,
      wear: 'FT',
      stickers: null,
      itemDefinition: { marketHashName: 'AK-47 | Redline (Field-Tested)' },
    };

    assert.deepEqual(
      getBulkListableSiblings([caseA, caseB, skin], caseA).map((asset) => asset.id),
      ['case-1', 'case-2'],
    );
    assert.deepEqual(getBulkListableSiblings([skin], skin).map((asset) => asset.id), [
      'skin-1',
    ]);
  });

  it('stacks fungible duplicates and keeps skins separate', () => {
    const caseA = {
      id: 'case-1',
      status: 'AVAILABLE',
      tradable: true,
      floatValue: null,
      paintSeed: null,
      wear: null,
      stickers: null,
      itemDefinition: { marketHashName: 'Gallery Case' },
    };
    const caseB = {
      ...caseA,
      id: 'case-2',
    };
    const caseListed = {
      ...caseA,
      id: 'case-listed',
      status: 'LISTED',
    };
    const skinA = {
      id: 'skin-1',
      status: 'AVAILABLE',
      tradable: true,
      floatValue: '0.12',
      paintSeed: 42,
      wear: 'FT',
      stickers: null,
      itemDefinition: { marketHashName: 'AK-47 | Redline (Field-Tested)' },
    };
    const skinB = {
      ...skinA,
      id: 'skin-2',
      floatValue: '0.21',
      paintSeed: 7,
    };

    const stacks = groupInventoryAssetsForDisplay([
      caseA,
      skinA,
      caseB,
      skinB,
      caseListed,
    ]);

    assert.equal(stacks.length, 4);
    assert.equal(stacks[0]?.key, 'fungible:listable:Gallery Case');
    assert.equal(stacks[0]?.count, 2);
    assert.equal(stacks[0]?.representative.id, 'case-1');
    assert.equal(stacks[1]?.count, 1);
    assert.equal(stacks[1]?.representative.id, 'skin-1');
    assert.equal(stacks[2]?.count, 1);
    assert.equal(stacks[2]?.representative.id, 'skin-2');
    assert.equal(stacks[3]?.key, 'fungible:LISTED:Gallery Case');
    assert.equal(stacks[3]?.count, 1);
  });
});
