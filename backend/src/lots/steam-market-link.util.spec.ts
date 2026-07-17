import {
  buildSteamMarketListingUrl,
  lotWearMatchesMarketHashName,
  parseWearCodeFromMarketHashName,
  resolveSteamMarketHashName,
} from './steam-market-link.util';

describe('steam-market-link.util', () => {
  it('parses wear code from market hash name suffix', () => {
    expect(parseWearCodeFromMarketHashName('AK-47 | Redline (Minimal Wear)')).toBe(
      'MW',
    );
    expect(parseWearCodeFromMarketHashName('Revolution Case')).toBeNull();
  });

  it('appends wear suffix when market hash name has no wear tier', () => {
    expect(resolveSteamMarketHashName('AK-47 | Redline', 'MW')).toBe(
      'AK-47 | Redline (Minimal Wear)',
    );
  });

  it('fixes mismatched wear suffix using asset wear', () => {
    expect(
      resolveSteamMarketHashName('AK-47 | Redline (Factory New)', 'MW'),
    ).toBe('AK-47 | Redline (Minimal Wear)');
  });

  it('accepts full Steam exterior names as wear input', () => {
    expect(
      resolveSteamMarketHashName(
        'Dual Berettas | Polished Malachite (Factory New)',
        'Battle-Scarred',
      ),
    ).toBe('Dual Berettas | Polished Malachite (Battle-Scarred)');
  });

  it('keeps matching wear suffix unchanged', () => {
    expect(
      resolveSteamMarketHashName('AK-47 | Redline (Minimal Wear)', 'MW'),
    ).toBe('AK-47 | Redline (Minimal Wear)');
  });

  it('builds encoded Steam market listing URL for the resolved wear tier', () => {
    const url = buildSteamMarketListingUrl('AK-47 | Redline', 'MW');
    expect(url).toBe(
      'https://steamcommunity.com/market/listings/730/AK-47%20%7C%20Redline%20(Minimal%20Wear)',
    );
  });

  it('validates lot wear against market hash name suffix', () => {
    expect(
      lotWearMatchesMarketHashName('AK-47 | Redline (Minimal Wear)', 'MW'),
    ).toBe(true);
    expect(
      lotWearMatchesMarketHashName('AK-47 | Redline (Minimal Wear)', 'FN'),
    ).toBe(false);
    expect(lotWearMatchesMarketHashName('Revolution Case', null)).toBe(true);
  });
});
