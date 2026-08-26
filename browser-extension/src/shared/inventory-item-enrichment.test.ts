import { describe, expect, it } from 'vitest';
import {
  buildInventoryItemEnrichmentView,
  formatTradeLockLabel,
  parseAssetIdFromItemElementId,
  parseWearFromMarketHashName,
  readSteamIdFromDocumentHtml,
  resolveInventoryBadges,
} from './inventory-item-enrichment.js';
import {
  buildPlatformFactsMap,
  parseInventoryEnrichmentPage,
} from './inventory-enrichment-data.js';

describe('inventory-item-enrichment', () => {
  it('parses wear and asset ids', () => {
    expect(
      parseWearFromMarketHashName('AK-47 | Redline (Field-Tested)'),
    ).toBe('FT');
    expect(parseAssetIdFromItemElementId('item730_2_27123456789')).toBe(
      '27123456789',
    );
    expect(parseAssetIdFromItemElementId('tradeofferid_1')).toBeNull();
  });

  it('reads steam id from page html', () => {
    expect(
      readSteamIdFromDocumentHtml('var g_steamID = "76561198000000000";'),
    ).toBe('76561198000000000');
  });

  it('formats trade lock countdown', () => {
    const now = Date.parse('2026-08-26T12:00:00.000Z');
    expect(
      formatTradeLockLabel('2026-08-28T12:00:00.000Z', now),
    ).toBe('Trade-lock ~2 дн');
    expect(formatTradeLockLabel('2026-08-26T10:00:00.000Z', now)).toBeNull();
  });

  it('prioritizes listed / deal / lock badges', () => {
    const badges = resolveInventoryBadges({
      steam: {
        tradable: true,
        marketable: true,
        tradeLockUntil: null,
      },
      platform: {
        inventoryAssetId: 'uuid-1',
        assetStatus: 'LISTED',
        listed: true,
        lotId: 'lot-1',
        listedPriceMinor: '12500',
        lotUrl: 'https://p2pcs.ru/lots/lot-1',
        inActiveDeal: false,
        hasActiveTradeTask: false,
        orderId: null,
        orderUrl: null,
      },
    });
    expect(badges[0]?.kind).toBe('listed');
    expect(badges[0]?.label).toContain('$125.00');
    expect(badges.some((b) => b.kind === 'tradable')).toBe(true);
  });

  it('builds enrichment view with float meta', () => {
    const view = buildInventoryItemEnrichmentView({
      steam: {
        assetId: '1',
        marketHashName: 'AWP | Asiimov (Field-Tested)',
        floatValue: '0.25000000',
        paintSeed: 661,
        wear: 'FT',
        tradable: true,
        marketable: true,
        tradeLockUntil: null,
      },
      priceHint: {
        steamPriceMinor: 2000,
        minMarketplacePriceMinor: '1500',
      },
    });
    expect(view.wearPointerPercent).toBe(25);
    expect(view.metaLine).toContain('0.25');
    expect(view.metaLine).toContain('FT');
    expect(view.metaLine).toContain('seed 661');
    expect(view.pricePrimary).toBe('R.I.P ~$19.00');
    expect(view.priceNet).toContain('вам');
  });
});

describe('inventory-enrichment-data', () => {
  it('parses steam enrichment page', () => {
    const items = parseInventoryEnrichmentPage({
      success: 1,
      assets: [{ assetid: '99', classid: '1', instanceid: '0' }],
      descriptions: [
        {
          classid: '1',
          instanceid: '0',
          market_hash_name: 'M4A4 | Neo-Noir (Minimal Wear)',
          tradable: 1,
          marketable: 1,
        },
      ],
      asset_properties: [
        {
          assetid: '99',
          asset_properties: [
            { propertyid: 1, float_value: '0.11' },
            { propertyid: 2, int_value: '420' },
          ],
        },
      ],
    });
    expect(items).toHaveLength(1);
    expect(items[0]?.wear).toBe('MW');
    expect(items[0]?.floatValue).toBe('0.11');
    expect(items[0]?.paintSeed).toBe(420);
  });

  it('builds platform facts for listed and deal assets', () => {
    const map = buildPlatformFactsMap({
      assets: [
        {
          id: 'uuid-a1',
          assetExternalId: 'a1',
          status: 'LISTED',
          activeLotId: 'lot-9',
          listedPriceMinor: '500',
        },
      ],
      dealAssetIds: new Set(['a2']),
      dealOrderByAssetId: new Map([
        ['a2', { orderId: 'ord-1', siteUrl: 'https://p2pcs.ru/orders/ord-1' }],
      ]),
      siteOrigin: 'https://p2pcs.ru',
    });
    expect(map.get('a1')?.listed).toBe(true);
    expect(map.get('a1')?.inventoryAssetId).toBe('uuid-a1');
    expect(map.get('a1')?.hasActiveTradeTask).toBe(false);
    expect(map.get('a1')?.lotUrl).toContain('/lots/lot-9');
    expect(map.get('a2')?.inActiveDeal).toBe(true);
  });
});
