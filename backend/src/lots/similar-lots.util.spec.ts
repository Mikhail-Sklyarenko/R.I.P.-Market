import { pickSimilarLots, scoreSimilarLot } from './similar-lots.util';

describe('similar-lots.util', () => {
  const source = {
    id: 'source',
    itemDefinitionId: 'item-1',
    marketHashName: 'AK-47 | Redline (Field-Tested)',
    floatValue: '0.25',
    wear: 'FT',
  };

  it('prefers same item definition and close float tier', () => {
    const exactTier = scoreSimilarLot(source, {
      id: 'a',
      priceMinor: 1000n,
      floatValue: '0.26',
      wear: 'FT',
      itemDefinitionId: 'item-1',
      marketHashName: 'AK-47 | Redline (Field-Tested)',
    });
    const differentItem = scoreSimilarLot(source, {
      id: 'b',
      priceMinor: 900n,
      floatValue: '0.26',
      wear: 'FT',
      itemDefinitionId: 'item-2',
      marketHashName: 'M4A4 | Neo-Noir (Field-Tested)',
    });

    expect(exactTier).toBeGreaterThan(differentItem);
  });

  it('picks closest floats within limit', () => {
    const picked = pickSimilarLots(
      source,
      [
        {
          id: 'far',
          priceMinor: 500n,
          floatValue: '0.80',
          wear: 'BS',
          itemDefinitionId: 'item-1',
          marketHashName: 'AK-47 | Redline (Field-Tested)',
        },
        {
          id: 'close',
          priceMinor: 700n,
          floatValue: '0.24',
          wear: 'FT',
          itemDefinitionId: 'item-1',
          marketHashName: 'AK-47 | Redline (Field-Tested)',
        },
      ],
      1,
    );

    expect(picked.map((entry) => entry.id)).toEqual(['close']);
  });

  it('excludes source lot from results', () => {
    const picked = pickSimilarLots(
      source,
      [
        {
          id: 'source',
          priceMinor: 500n,
          floatValue: '0.25',
          wear: 'FT',
          itemDefinitionId: 'item-1',
          marketHashName: 'AK-47 | Redline (Field-Tested)',
        },
      ],
      3,
    );

    expect(picked).toHaveLength(0);
  });
});
