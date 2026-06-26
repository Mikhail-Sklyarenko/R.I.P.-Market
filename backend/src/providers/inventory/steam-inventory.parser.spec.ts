import fixture from './fixtures/steam-inventory-page1.json';
import {
  isPrivateInventoryResponse,
  parseSteamInventoryResponse,
  SteamInventoryResponse,
} from './steam-inventory.parser';

describe('steam-inventory.parser', () => {
  it('maps Steam inventory JSON to parsed assets', () => {
    const parsed = parseSteamInventoryResponse(
      fixture as SteamInventoryResponse,
    );

    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toEqual({
      assetExternalId: '12345678901',
      marketHashName: 'AK-47 | Redline (Field-Tested)',
      weapon: 'AK-47',
      rarity: 'Classified',
      tradable: true,
      tradeLockUntil: null,
      floatValue: '0.254319',
      paintSeed: 661,
      wear: 'FT',
    });
    expect(parsed[1]).toMatchObject({
      assetExternalId: '12345678902',
      tradable: false,
      wear: 'BS',
      tradeLockUntil: new Date('2026-07-01T00:00:00Z'),
    });
  });

  it('detects private inventory responses', () => {
    expect(isPrivateInventoryResponse({ success: 15 }, 200)).toBe(true);
    expect(isPrivateInventoryResponse({ success: 1 }, 403)).toBe(true);
    expect(isPrivateInventoryResponse({ success: 1 }, 200)).toBe(false);
  });
});
