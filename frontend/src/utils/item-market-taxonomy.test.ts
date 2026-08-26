import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Lot } from '../api/types.ts';
import {
  isNoFloatWeapon,
  resolveItemMarketTraits,
  resolveItemOffersColumns,
  resolveOrderBookAskFloatVisibility,
} from './item-market-taxonomy.ts';

function makeLot(id: string, floatValue?: string | null, stickers?: { name: string }[]): Lot {
  return {
    id,
    status: 'ACTIVE',
    priceMinor: '100',
    commissionMinor: '0',
    sellerReceiveMinor: '100',
    createdAt: '2026-07-01T00:00:00.000Z',
    inventoryAsset: {
      id: `asset-${id}`,
      status: 'LISTED',
      tradable: true,
      floatValue: floatValue ?? null,
      stickers: stickers ?? [],
      itemDefinition: {
        marketHashName: 'Gallery Case',
        weapon: 'Case',
      },
    },
    listingSnapshot: floatValue
      ? {
          id: `snap-${id}`,
          lotId: id,
          assetExternalId: `asset-${id}`,
          marketHashName: 'Gallery Case',
          weapon: 'Case',
          floatValue,
          tradable: true,
          marketable: true,
          capturedAt: '2026-07-01T00:00:00.000Z',
          stickers: stickers ?? [],
        }
      : null,
  };
}

describe('item-market-taxonomy', () => {
  it('marks cases and terminals as fungible without float/stickers', () => {
    const traits = resolveItemMarketTraits({
      weapon: 'Case',
      marketHashName: 'Gallery Case',
      availableWears: [],
    });
    assert.equal(traits.marketKind, 'fungible');
    assert.equal(traits.supportsWear, false);
    assert.equal(traits.supportsFloat, false);
    assert.equal(traits.supportsStickers, false);
    assert.equal(isNoFloatWeapon('Terminal'), true);
  });

  it('marks wear skins as differentiated with float and stickers', () => {
    const byWears = resolveItemMarketTraits({
      weapon: 'AK-47',
      marketHashName: 'AK-47 | Redline',
      availableWears: ['FT', 'MW'],
    });
    assert.equal(byWears.marketKind, 'differentiated');
    assert.equal(byWears.supportsWear, true);
    assert.equal(byWears.supportsFloat, true);
    assert.equal(byWears.supportsStickers, true);

    const byHash = resolveItemMarketTraits({
      weapon: 'AK-47',
      marketHashName: 'AK-47 | Redline (Field-Tested)',
      availableWears: [],
    });
    assert.equal(byHash.supportsWear, true);
    assert.equal(byHash.supportsFloat, true);
  });

  it('hides float/stickers columns for cases even when lots are empty dashes', () => {
    const columns = resolveItemOffersColumns(
      { weapon: 'Case', marketHashName: 'Gallery Case', availableWears: [] },
      [makeLot('a', null), makeLot('b', null)],
    );
    assert.deepEqual(columns, { showFloat: false, showStickers: false });
  });

  it('shows float when live lots have float even if taxonomy was conservative', () => {
    const columns = resolveItemOffersColumns(
      { weapon: 'Case', marketHashName: 'Gallery Case', availableWears: [] },
      [makeLot('weird', '0.1234')],
    );
    assert.equal(columns.showFloat, true);
  });

  it('resolves order-book ask float visibility from taxonomy and evidence', () => {
    assert.equal(
      resolveOrderBookAskFloatVisibility(
        { weapon: 'Case', marketHashName: 'Gallery Case' },
        [{ floatValue: null }, { floatValue: null }],
      ),
      false,
    );
    assert.equal(
      resolveOrderBookAskFloatVisibility(
        { weapon: 'AWP', marketHashName: 'AWP | Asiimov', availableWears: ['FT'] },
        [{ floatValue: null }],
      ),
      true,
    );
    assert.equal(
      resolveOrderBookAskFloatVisibility(
        { weapon: 'Case', marketHashName: 'Gallery Case' },
        [{ floatValue: 0.01 }],
      ),
      true,
    );
  });
});
