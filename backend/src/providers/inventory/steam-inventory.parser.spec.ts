import fixture from './fixtures/steam-inventory-page1.json';
import {
  isPrivateInventoryResponse,
  parseSteamInventoryResponse,
} from './steam-inventory.parser';

describe('steam-inventory.parser', () => {
  it('maps Steam inventory JSON to parsed assets', () => {
    const parsed = parseSteamInventoryResponse(fixture);

    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toEqual({
      assetExternalId: '12345678901',
      marketHashName: 'AK-47 | Redline (Field-Tested)',
      weapon: 'AK-47',
      rarity: 'Classified',
      iconUrl:
        '-9a81dlWLwJ2UUGcVs_nsVze-rNIjLSm9wSizZLQmfJIMWn3kSKfJjx0XfZR2f0XqYh8f_large',
      tradable: true,
      marketable: true,
      tradeLockUntil: null,
      floatValue: '0.254319',
      paintSeed: 661,
      wear: 'FT',
      stickers: [],
      inspectLinkTemplate: null,
      inspectLinkPayload: null,
      classExternalId: '310776580',
      instanceExternalId: '302028390',
    });
    expect(parsed[1]).toMatchObject({
      assetExternalId: '12345678902',
      iconUrl:
        '-9a81dlWLwJ2UUGcVs_nsVze-rNIjLSm9wSizZLQmfJIMWn3kSKfJjx0XfZR2f0XqYh8g',
      tradable: false,
      marketable: false,
      wear: 'BS',
      tradeLockUntil: new Date('2026-07-01T00:00:00Z'),
    });
  });

  it('prefers icon_url_large over icon_url', () => {
    const parsed = parseSteamInventoryResponse({
      success: 1,
      assets: [
        {
          appid: 730,
          contextid: '2',
          assetid: '1',
          classid: '1',
          instanceid: '1',
        },
      ],
      descriptions: [
        {
          classid: '1',
          instanceid: '1',
          market_hash_name: 'Test Item',
          icon_url: 'small-icon',
          icon_url_large: 'large-icon',
        },
      ],
    });

    expect(parsed[0]?.iconUrl).toBe('large-icon');
  });

  it('falls back to icon_url when icon_url_large is missing', () => {
    const parsed = parseSteamInventoryResponse({
      success: 1,
      assets: [
        {
          appid: 730,
          contextid: '2',
          assetid: '1',
          classid: '1',
          instanceid: '1',
        },
      ],
      descriptions: [
        {
          classid: '1',
          instanceid: '1',
          market_hash_name: 'Test Item',
          icon_url: 'small-icon-only',
        },
      ],
    });

    expect(parsed[0]?.iconUrl).toBe('small-icon-only');
  });

  it('parses CS2 Item Certificate payload from asset_properties', () => {
    const parsed = parseSteamInventoryResponse({
      success: 1,
      assets: [
        {
          appid: 730,
          contextid: '2',
          assetid: '50889527765',
          classid: '7993035990',
          instanceid: '302028390',
        },
      ],
      descriptions: [
        {
          classid: '7993035990',
          instanceid: '302028390',
          market_hash_name: 'P250 | Plum Netting (Minimal Wear)',
          icon_url: 'icon',
          tradable: 1,
          actions: [
            {
              name: 'Inspect in Game...',
              link: 'steam://run/730//+csgo_econ_action_preview%20%propid:6%',
            },
          ],
        },
      ],
      asset_properties: [
        {
          appid: 730,
          contextid: '2',
          assetid: '50889527765',
          asset_properties: [
            {
              propertyid: 6,
              string_value:
                'ADBD584A390016ACB5B48D3BA485AE9DA4952F0E5A47AEED62AEE5ADFDADC52E2D2D2DA1DDA56A5E748D',
            },
          ],
        },
      ],
    });

    expect(parsed[0]?.inspectLinkTemplate).toContain('%propid:6%');
    expect(parsed[0]?.inspectLinkPayload).toBe(
      'ADBD584A390016ACB5B48D3BA485AE9DA4952F0E5A47AEED62AEE5ADFDADC52E2D2D2DA1DDA56A5E748D',
    );
  });

  it('detects private inventory responses', () => {
    expect(isPrivateInventoryResponse({ success: 15 }, 200)).toBe(true);
    expect(isPrivateInventoryResponse({ success: 15 }, 403)).toBe(true);
    // Akamai/CDN HTML 403 has no success field — not private inventory.
    expect(isPrivateInventoryResponse(null, 403)).toBe(false);
    expect(isPrivateInventoryResponse({ success: 1 }, 403)).toBe(false);
    expect(isPrivateInventoryResponse({ success: 1 }, 200)).toBe(false);
    expect(isPrivateInventoryResponse(null, 404)).toBe(false);
  });
});
