import {
  buildMarketHashNameWithWear,
  deriveBaseMarketHashName,
  wearCodesFromSteamWearNames,
} from './base-market-hash-name.util';

describe('base-market-hash-name util', () => {
  it('strips wear suffixes from Steam market hash names', () => {
    expect(deriveBaseMarketHashName('AK-47 | Redline (Field-Tested)')).toBe(
      'AK-47 | Redline',
    );
    expect(
      deriveBaseMarketHashName('StatTrak™ AK-47 | Redline (Minimal Wear)'),
    ).toBe('StatTrak™ AK-47 | Redline');
    expect(deriveBaseMarketHashName('★ Karambit')).toBe('★ Karambit');
  });

  it('maps wear display names to codes', () => {
    expect(
      wearCodesFromSteamWearNames([
        { name: 'Factory New' },
        { name: 'Field-Tested' },
      ]),
    ).toEqual(['FN', 'FT']);
  });

  it('rebuilds market hash names with wear', () => {
    expect(buildMarketHashNameWithWear('AK-47 | Redline', 'FT')).toBe(
      'AK-47 | Redline (Field-Tested)',
    );
  });
});
