import { describe, expect, it } from 'vitest';
import {
  factsFromActiveInventoryLike,
  factsFromEnrichmentApiBody,
  inventoryItemSteamFactsToMap,
} from './steam-inventory-page-enrichment.js';

describe('steam-inventory-page-enrichment', () => {
  it('parses flat g_ActiveInventory assets + descriptions', () => {
    const facts = factsFromActiveInventoryLike({
      appid: 730,
      contextid: 2,
      m_rgAssets: {
        '27123456789': {
          assetid: '27123456789',
          classid: '10',
          instanceid: '0',
        },
      },
      m_rgDescriptions: {
        '10_0': {
          market_hash_name: 'AK-47 | Redline (Field-Tested)',
          tradable: 1,
          marketable: 1,
        },
      },
      m_rgAssetProperties: [
        {
          assetid: '27123456789',
          asset_properties: [
            { propertyid: 1, float_value: '0.22' },
            { propertyid: 2, int_value: '512' },
          ],
        },
      ],
    });

    expect(facts).toHaveLength(1);
    expect(facts[0]?.assetId).toBe('27123456789');
    expect(facts[0]?.marketHashName).toBe('AK-47 | Redline (Field-Tested)');
    expect(facts[0]?.wear).toBe('FT');
    expect(facts[0]?.floatValue).toBe('0.22');
    expect(facts[0]?.paintSeed).toBe(512);
    expect(facts[0]?.tradable).toBe(true);
  });

  it('parses nested app/context asset bags', () => {
    const facts = factsFromActiveInventoryLike({
      m_appid: 730,
      m_rgAssets: {
        '730_2': {
          '99': { id: '99', classid: '1', instanceid: '0' },
        },
      },
      m_rgDescriptions: {
        '730': {
          '1_0': {
            market_name: 'Fever Case',
            tradable: 1,
            marketable: 0,
          },
        },
      },
    });
    expect(facts).toHaveLength(1);
    expect(facts[0]?.marketHashName).toBe('Fever Case');
    expect(facts[0]?.marketable).toBe(false);
  });

  it('ignores non-CS2 active inventory', () => {
    expect(
      factsFromActiveInventoryLike({
        appid: 440,
        m_rgAssets: { '1': { assetid: '1', classid: '1', instanceid: '0' } },
      }),
    ).toEqual([]);
  });

  it('maps enrichment API body and index by asset id', () => {
    const facts = factsFromEnrichmentApiBody({
      success: 1,
      assets: [{ assetid: '7', classid: '1', instanceid: '0' }],
      descriptions: [
        {
          classid: '1',
          instanceid: '0',
          market_hash_name: 'M4A4 | Neo-Noir (Minimal Wear)',
          tradable: 1,
          marketable: 1,
        },
      ],
    });
    const map = inventoryItemSteamFactsToMap(facts);
    expect(map.get('7')?.wear).toBe('MW');
  });
});
