import {
  resolveSteamMarketNamesForCatalogCard,
} from './catalog-steam-price-names.util';

describe('resolveSteamMarketNamesForCatalogCard', () => {
  it('returns exact name when item has no wears', () => {
    expect(
      resolveSteamMarketNamesForCatalogCard('Sticker | Titan', []),
    ).toEqual(['Sticker | Titan']);
    expect(
      resolveSteamMarketNamesForCatalogCard('3rd Commando Company | KSK', null),
    ).toEqual(['3rd Commando Company | KSK']);
  });

  it('prefers FT then MW for skins with available wears', () => {
    expect(
      resolveSteamMarketNamesForCatalogCard('AK-47 | Bloodsport', [
        'FN',
        'MW',
        'FT',
        'WW',
      ]),
    ).toEqual([
      'AK-47 | Bloodsport (Field-Tested)',
      'AK-47 | Bloodsport (Minimal Wear)',
    ]);
  });
});
