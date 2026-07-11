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

  it('detects private inventory responses', () => {
    expect(isPrivateInventoryResponse({ success: 15 }, 200)).toBe(true);
    expect(isPrivateInventoryResponse({ success: 1 }, 403)).toBe(true);
    expect(isPrivateInventoryResponse({ success: 1 }, 200)).toBe(false);
    expect(isPrivateInventoryResponse(null, 404)).toBe(false);
  });
});
