import {
  resolveAllWearSteamMarketNames,
  resolveCatalogCardDisplaySteamPriceName,
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

  it('returns all wears ordered by liquidity for skins', () => {
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
      'AK-47 | Bloodsport (Factory New)',
      'AK-47 | Bloodsport (Well-Worn)',
    ]);
  });
});

describe('resolveCatalogCardDisplaySteamPriceName', () => {
  it('prefers FT for catalog grid display', () => {
    expect(
      resolveCatalogCardDisplaySteamPriceName('AK-47 | Bloodsport', [
        'FN',
        'MW',
        'FT',
      ]),
    ).toBe('AK-47 | Bloodsport (Field-Tested)');
  });
});

describe('resolveAllWearSteamMarketNames', () => {
  it('aliases resolveSteamMarketNamesForCatalogCard', () => {
    const wears = ['BS', 'FN'];
    expect(resolveAllWearSteamMarketNames('M4A4 | Neo-Noir', wears)).toEqual(
      resolveSteamMarketNamesForCatalogCard('M4A4 | Neo-Noir', wears),
    );
  });
});
