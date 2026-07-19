import { buildCatalogSkinCardSeeds } from './import-cs2-catalog.util';

describe('buildCatalogSkinCardSeeds', () => {
  it('groups wear variants into one card and keeps StatTrak separate', () => {
    const seeds = buildCatalogSkinCardSeeds([
      {
        market_hash_name: 'AK-47 | Redline (Field-Tested)',
        image: 'https://example.com/ft.png',
        weapon: { name: 'AK-47' },
        rarity: { name: 'Classified' },
        wear: { name: 'Field-Tested' },
      },
      {
        market_hash_name: 'AK-47 | Redline (Factory New)',
        wear: { name: 'Factory New' },
      },
      {
        market_hash_name: 'StatTrak™ AK-47 | Redline (Minimal Wear)',
        weapon: { name: 'AK-47' },
        wear: { name: 'Minimal Wear' },
      },
      {
        market_hash_name: '2024 Service Medal',
        wear: { name: 'Factory New' },
      },
    ]);

    expect(seeds).toHaveLength(2);
    expect(seeds[0]?.marketHashName).toBe('AK-47 | Redline');
    expect(seeds[0]?.availableWears).toEqual(['FN', 'FT']);
    expect(seeds[0]?.iconUrl).toBe('https://example.com/ft.png');
    expect(seeds[1]?.marketHashName).toBe('StatTrak™ AK-47 | Redline');
    expect(seeds[1]?.availableWears).toEqual(['MW']);
  });
});
