import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Lot } from '../api/types.ts';
import { sortItemOffers } from './item-offers-sort.ts';

function makeLot(id: string, priceMinor: string, floatValue?: string | null): Lot {
  return {
    id,
    status: 'ACTIVE',
    priceMinor,
    commissionMinor: '0',
    sellerReceiveMinor: priceMinor,
    createdAt: '2026-07-01T00:00:00.000Z',
    inventoryAsset: {
      id: `asset-${id}`,
      status: 'LISTED',
      tradable: true,
      floatValue: floatValue ?? null,
      itemDefinition: {
        marketHashName: 'AK-47 | Redline (Field-Tested)',
      },
    },
    listingSnapshot: floatValue
      ? {
          id: `snap-${id}`,
          lotId: id,
          assetExternalId: `asset-${id}`,
          marketHashName: 'AK-47 | Redline (Field-Tested)',
          floatValue,
          tradable: true,
          marketable: true,
          capturedAt: '2026-07-01T00:00:00.000Z',
        }
      : null,
  };
}

describe('sortItemOffers', () => {
  it('sorts by price ascending', () => {
    const lots = [makeLot('b', '200'), makeLot('a', '100')];
    assert.deepEqual(
      sortItemOffers(lots, 'price_asc').map((lot) => lot.id),
      ['a', 'b'],
    );
  });

  it('sorts by float ascending with empty floats last', () => {
    const lots = [
      makeLot('high', '100', '0.30'),
      makeLot('low', '100', '0.10'),
      makeLot('empty', '100', null),
    ];
    assert.deepEqual(
      sortItemOffers(lots, 'float_asc').map((lot) => lot.id),
      ['low', 'high', 'empty'],
    );
  });
});
