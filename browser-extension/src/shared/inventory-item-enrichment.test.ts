import { describe, expect, it, vi } from 'vitest';
import {
  buildInventoryItemEnrichmentView,
  formatTradeLockLabel,
  parseAssetIdFromItemElementId,
  parseWearFromMarketHashName,
  queryCs2InventoryItemByAssetId,
  readSteamIdFromDocumentHtml,
  resolveInventoryBadges,
  resolveInventoryPageSteamId,
  waitForSteamIdInDocument,
} from './inventory-item-enrichment.js';
import {
  buildPlatformFactsMap,
  fetchCs2InventoryEnrichmentFacts,
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
    expect(parseAssetIdFromItemElementId('730_16_50620552134')).toBe(
      '50620552134',
    );
    expect(parseAssetIdFromItemElementId('730_2_111')).toBe('111');
    expect(parseAssetIdFromItemElementId('tradeofferid_1')).toBeNull();
  });

  it('finds items by asset id including digit-start Steam ids', () => {
    document.body.innerHTML = `
      <div class="item" id="item730_2_27123456789"></div>
      <div class="item" id="730_2_50586843203"></div>
      <div class="item" id="730_16_50620546465"></div>
    `;
    expect(queryCs2InventoryItemByAssetId(document, '27123456789')?.id).toBe(
      'item730_2_27123456789',
    );
    expect(queryCs2InventoryItemByAssetId(document, '50586843203')?.id).toBe(
      '730_2_50586843203',
    );
    expect(queryCs2InventoryItemByAssetId(document, '50620546465')?.id).toBe(
      '730_16_50620546465',
    );
    expect(queryCs2InventoryItemByAssetId(document, 'missing')).toBeNull();
    expect(queryCs2InventoryItemByAssetId(document, '  ')).toBeNull();
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
    ).toBe('Hold · 2 дн');
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
        marketHashName: 'AK-47 | Redline (Field-Tested)',
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
    // Healthy tradable/marketable states stay quiet — card chrome is for float + sell.
    expect(badges.some((b) => b.kind === 'tradable')).toBe(false);
    expect(badges.some((b) => b.kind === 'marketable')).toBe(false);
  });

  it('surfaces only blocker badges when item cannot trade', () => {
    const badges = resolveInventoryBadges({
      steam: {
        tradable: false,
        marketable: false,
        tradeLockUntil: null,
      },
    });
    expect(badges.map((b) => b.kind)).toEqual(['not_tradable', 'marketable']);
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
    expect(view.priceCompact).toBe('~$19.00');
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

  it('retries transient Steam 500 then loads enrichment', async () => {
    let attempts = 0;
    const fetchImpl = vi.fn(async () => {
      attempts += 1;
      if (attempts < 3) {
        return {
          ok: false,
          status: 500,
          headers: { get: () => null },
          json: async () => ({}),
        } as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({
          success: 1,
          assets: [{ assetid: '42', classid: '1', instanceid: '0' }],
          descriptions: [
            {
              classid: '1',
              instanceid: '0',
              market_hash_name: 'AK-47 | Redline (Field-Tested)',
              tradable: 1,
              marketable: 1,
            },
          ],
        }),
      } as unknown as Response;
    });

    const map = await fetchCs2InventoryEnrichmentFacts(
      '76561198000000000',
      fetchImpl as typeof fetch,
    );
    expect(attempts).toBe(3);
    expect(map.get('42')?.wear).toBe('FT');
  });

  it('rejects invalid steam id before fetch', async () => {
    await expect(
      fetchCs2InventoryEnrichmentFacts('animehuylove', fetch),
    ).rejects.toThrow(/Invalid SteamID64/);
  });
});

describe('inventory page steam id resolve', () => {
  it('prefers profiles path', async () => {
    const id = await resolveInventoryPageSteamId({
      pathname: '/profiles/76561198111111111/inventory',
      getHtml: () => '',
      fetchImpl: vi.fn() as unknown as typeof fetch,
    });
    expect(id).toBe('76561198111111111');
  });

  it('waits for g_steamID on vanity pages', async () => {
    let html = '';
    window.setTimeout(() => {
      html = 'var g_steamID = "76561198222222222";';
    }, 40);
    const id = await waitForSteamIdInDocument({
      getHtml: () => html,
      timeoutMs: 500,
      intervalMs: 20,
    });
    expect(id).toBe('76561198222222222');
  });

  it('falls back to my/profile redirect', async () => {
    const fetchImpl = vi.fn(async () => ({
      url: 'https://steamcommunity.com/profiles/76561198333333333/',
    })) as unknown as typeof fetch;
    const id = await resolveInventoryPageSteamId({
      pathname: '/id/animehuylove/inventory',
      getHtml: () => '',
      fetchImpl,
      waitTimeoutMs: 30,
      waitIntervalMs: 10,
    });
    expect(id).toBe('76561198333333333');
  });
});
