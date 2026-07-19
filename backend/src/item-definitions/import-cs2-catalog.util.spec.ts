import {
  buildCatalogCardSeeds,
  buildCatalogSkinCardSeeds,
  CS2_CATALOG_SOURCES,
  mergeCatalogCardSeeds,
  resolveCatalogMarketHashName,
} from './import-cs2-catalog.util';

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

describe('buildCatalogCardSeeds for non-skin sources', () => {
  const stickerSource = CS2_CATALOG_SOURCES.find((s) => s.id === 'sticker')!;
  const keySource = CS2_CATALOG_SOURCES.find((s) => s.id === 'key')!;
  const toolSource = CS2_CATALOG_SOURCES.find((s) => s.id === 'tool')!;
  const crateSource = CS2_CATALOG_SOURCES.find((s) => s.id === 'crate')!;

  it('imports stickers by market hash and name fallback', () => {
    const seeds = buildCatalogCardSeeds(
      [
        {
          market_hash_name: 'Sticker | Titan (Holo) | Katowice 2014',
          image: 'https://example.com/titan.png',
          rarity: { name: 'Remarkable' },
        },
        {
          name: 'Sticker | Shooter',
          image: 'https://example.com/shooter.png',
        },
      ],
      stickerSource,
    );

    expect(seeds).toHaveLength(2);
    expect(seeds.map((s) => s.marketHashName).sort()).toEqual([
      'Sticker | Shooter',
      'Sticker | Titan (Holo) | Katowice 2014',
    ]);
    expect(seeds[0]?.weapon).toBe('Sticker');
    expect(seeds[0]?.availableWears).toEqual([]);
  });

  it('skips explicitly unmarketable keys', () => {
    const seeds = buildCatalogCardSeeds(
      [
        {
          market_hash_name: 'CS:GO Case Key',
          marketable: true,
        },
        {
          market_hash_name: 'Shattered Web Case Key',
          marketable: false,
        },
      ],
      keySource,
    );

    expect(seeds).toHaveLength(1);
    expect(seeds[0]?.marketHashName).toBe('CS:GO Case Key');
    expect(seeds[0]?.weapon).toBe('Key');
  });

  it('imports tools via display name fallback', () => {
    const seeds = buildCatalogCardSeeds(
      [{ name: 'Name Tag', image: 'https://example.com/tag.png' }],
      toolSource,
    );
    expect(seeds).toEqual([
      expect.objectContaining({
        marketHashName: 'Name Tag',
        weapon: 'Tool',
        iconUrl: 'https://example.com/tag.png',
      }),
    ]);
  });

  it('uses crate type as weapon label when present', () => {
    const seeds = buildCatalogCardSeeds(
      [
        {
          market_hash_name: 'Revolution Case',
          type: 'Case',
          rarity: { name: 'Base Grade' },
        },
        {
          market_hash_name: 'Stockholm 2021 Contenders Sticker Capsule',
          type: 'Capsule',
        },
      ],
      crateSource,
    );
    expect(seeds.find((s) => s.marketHashName === 'Revolution Case')?.weapon).toBe(
      'Case',
    );
    expect(
      seeds.find(
        (s) => s.marketHashName === 'Stockholm 2021 Contenders Sticker Capsule',
      )?.weapon,
    ).toBe('Capsule');
  });
});

describe('mergeCatalogCardSeeds', () => {
  it('dedupes by market hash and unions wears', () => {
    const merged = mergeCatalogCardSeeds([
      [
        {
          marketHashName: 'AK-47 | Redline',
          baseMarketHashName: 'AK-47 | Redline',
          weapon: 'AK-47',
          rarity: 'Classified',
          iconUrl: null,
          availableWears: ['FT'],
        },
      ],
      [
        {
          marketHashName: 'AK-47 | Redline',
          baseMarketHashName: 'AK-47 | Redline',
          weapon: null,
          rarity: null,
          iconUrl: 'https://example.com/ak.png',
          availableWears: ['FN'],
        },
        {
          marketHashName: 'Sticker | Titan',
          baseMarketHashName: 'Sticker | Titan',
          weapon: 'Sticker',
          rarity: null,
          iconUrl: null,
          availableWears: [],
        },
      ],
    ]);

    expect(merged).toHaveLength(2);
    const skin = merged.find((s) => s.marketHashName === 'AK-47 | Redline');
    expect(skin?.availableWears).toEqual(['FN', 'FT']);
    expect(skin?.iconUrl).toBe('https://example.com/ak.png');
  });
});

describe('resolveCatalogMarketHashName', () => {
  it('prefers market_hash_name over name', () => {
    expect(
      resolveCatalogMarketHashName(
        { market_hash_name: 'A', name: 'B' },
        true,
      ),
    ).toBe('A');
  });

  it('falls back to name only when allowed', () => {
    expect(resolveCatalogMarketHashName({ name: 'Name Tag' }, true)).toBe(
      'Name Tag',
    );
    expect(resolveCatalogMarketHashName({ name: 'Name Tag' }, false)).toBeNull();
  });
});
