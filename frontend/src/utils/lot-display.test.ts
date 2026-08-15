import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Lot } from '../api/types.ts';
import { resolveLotDisplayItem } from './lot-display.ts';

function makeLot(overrides?: {
  snapshotFloat?: string | null;
  assetFloat?: string | null;
}): Lot {
  return {
    id: 'lot-1',
    status: 'ACTIVE',
    priceMinor: '1000',
    commissionMinor: '50',
    sellerReceiveMinor: '950',
    createdAt: '2026-08-01T00:00:00.000Z',
    inventoryAsset: {
      id: 'asset-1',
      status: 'LISTED',
      tradable: true,
      floatValue: overrides?.assetFloat ?? null,
      wear: 'MW',
      paintSeed: 123,
      itemDefinition: {
        id: 'def-1',
        marketHashName: 'P250 | Plum Netting (Minimal Wear)',
        weapon: 'P250',
        rarity: 'Consumer Grade',
        iconUrl: null,
      },
    },
    listingSnapshot: {
      id: 'snap-1',
      lotId: 'lot-1',
      assetExternalId: 'ext-1',
      marketHashName: 'P250 | Plum Netting (Minimal Wear)',
      weapon: 'P250',
      rarity: 'Consumer Grade',
      iconUrl: null,
      floatValue:
        overrides && 'snapshotFloat' in overrides
          ? overrides.snapshotFloat!
          : null,
      paintSeed: null,
      wear: 'MW',
      tradable: true,
      marketable: true,
      capturedAt: '2026-08-01T00:00:00.000Z',
    },
  };
}

describe('resolveLotDisplayItem', () => {
  it('uses snapshot float when present', () => {
    const display = resolveLotDisplayItem(
      makeLot({ snapshotFloat: '0.112233', assetFloat: '0.999999' }),
    );
    assert.equal(display.floatValue, '0.112233');
  });

  it('falls back to inventory float when snapshot float is missing', () => {
    const display = resolveLotDisplayItem(
      makeLot({ snapshotFloat: null, assetFloat: '0.254319' }),
    );
    assert.equal(display.floatValue, '0.254319');
    assert.equal(display.paintSeed, 123);
  });

  it('returns inventory asset when snapshot is absent', () => {
    const lot = makeLot({ assetFloat: '0.15' });
    lot.listingSnapshot = null;
    const display = resolveLotDisplayItem(lot);
    assert.equal(display.floatValue, '0.15');
  });
});
