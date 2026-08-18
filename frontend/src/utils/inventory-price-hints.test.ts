import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { InventoryAsset, InventoryPriceHint, InventoryPriceHintsResponse } from '../api/types.ts';
import {
  chunkStrings,
  fetchInventoryPriceHintsInChunks,
  hasAnySteamPrice,
  listableNamesMissingSteamPrice,
  mergeInventoryPriceHintResponses,
  namesMissingSteamPrice,
  uniqueMarketHashNames,
} from './inventory-price-hints.ts';

function asset(
  name: string,
  overrides: Partial<InventoryAsset> = {},
): InventoryAsset {
  return {
    id: name,
    status: 'AVAILABLE',
    tradable: true,
    marketable: true,
    itemDefinition: {
      marketHashName: name,
    },
    ...overrides,
  };
}

function hint(
  steamPriceMinor: number | null,
  minMarketplacePriceMinor: string | null = null,
): InventoryPriceHint {
  return {
    steamPriceMinor,
    buffPriceMinor: null,
    csfloatPriceMinor: null,
    minMarketplacePriceMinor,
  };
}

describe('inventory-price-hints', () => {
  it('chunks names within the API limit', () => {
    const names = Array.from({ length: 130 }, (_, index) => `item-${index}`);
    const chunks = chunkStrings(names, 60);
    assert.equal(chunks.length, 3);
    assert.equal(chunks[0]?.length, 60);
    assert.equal(chunks[2]?.length, 10);
  });

  it('treats missing and zero steam prices as gaps', () => {
    const hints: Record<string, InventoryPriceHint> = {
      listed: hint(1200, '900'),
      empty: hint(null, '500'),
    };
    assert.deepEqual(namesMissingSteamPrice(['listed', 'empty', 'absent'], hints), [
      'empty',
      'absent',
    ]);
  });

  it('counts only listable inventory names as missing steam prices', () => {
    const missing = listableNamesMissingSteamPrice(
      [
        asset('AK-47 | Redline (Field-Tested)'),
        asset('Service Medal'),
        asset('Fever Case', { tradable: false, marketable: false }),
      ],
      [
        'AK-47 | Redline (Field-Tested)',
        'Service Medal',
        'Fever Case',
        'Unknown Skin',
      ],
    );
    assert.deepEqual(missing, ['AK-47 | Redline (Field-Tested)']);
  });

  it('merges chunk responses without dropping earlier steam prices', () => {
    const merged = mergeInventoryPriceHintResponses([
      {
        hints: { a: hint(100) },
        steamPriceFetchedAt: '2026-08-18T10:00:00.000Z',
        steamPriceMissing: [],
      },
      {
        hints: { b: hint(null, '400') },
        steamPriceFetchedAt: '2026-08-18T11:00:00.000Z',
        steamPriceMissing: ['b'],
      },
    ]);
    assert.equal(merged.hints.a?.steamPriceMinor, 100);
    assert.equal(merged.steamPriceFetchedAt, '2026-08-18T11:00:00.000Z');
    assert.deepEqual(merged.steamPriceMissing, ['b']);
    assert.equal(hasAnySteamPrice(merged.hints), true);
  });

  it('does not infer Steam gaps when the API reported none', () => {
    const merged = mergeInventoryPriceHintResponses([
      {
        hints: { medal: hint(null) },
        steamPriceFetchedAt: null,
        steamPriceMissing: [],
      },
    ]);
    assert.deepEqual(merged.steamPriceMissing, []);
  });

  it('keeps successful chunks when another request fails', async () => {
    const seen: number[] = [];
    const result = await fetchInventoryPriceHintsInChunks(
      Array.from({ length: 70 }, (_, index) => `item-${index}`),
      async (chunk) => {
        seen.push(chunk.length);
        if (chunk.length < 60) {
          throw new Error('validation');
        }
        const hints: InventoryPriceHintsResponse['hints'] = {};
        for (const name of chunk) {
          hints[name] = hint(100);
        }
        return { hints, steamPriceFetchedAt: '2026-08-18T12:00:00.000Z', steamPriceMissing: [] };
      },
      60,
    );

    assert.deepEqual(seen, [60, 10]);
    assert.equal(result.okCount, 1);
    assert.equal(result.failCount, 1);
    assert.equal(Object.keys(result.response.hints).length, 60);
    assert.equal(hasAnySteamPrice(result.response.hints), true);
  });

  it('dedupes market hash names', () => {
    assert.deepEqual(
      uniqueMarketHashNames([asset('Case'), asset('Case'), asset('Sticker')]),
      ['Case', 'Sticker'],
    );
  });
});
