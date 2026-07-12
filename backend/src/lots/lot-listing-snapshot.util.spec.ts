import { buildLotListingSnapshotData } from './lot-listing-snapshot.util';

describe('buildLotListingSnapshotData', () => {
  it('normalizes market hash name to include wear suffix from asset', () => {
    const snapshot = buildLotListingSnapshotData(
      {
        assetExternalId: '123',
        floatValue: null,
        paintSeed: null,
        wear: 'MW',
        tradable: true,
        marketable: true,
        stickers: [],
        inspectLinkTemplate: null,
        classExternalId: '1',
        instanceExternalId: '2',
        itemDefinition: {
          marketHashName: 'AK-47 | Redline (Factory New)',
          weapon: 'AK-47',
          rarity: 'Classified',
          iconUrl: null,
        },
      } as never,
      '76561198000000000',
    );

    expect(snapshot.marketHashName).toBe('AK-47 | Redline (Minimal Wear)');
    expect(snapshot.wear).toBe('MW');
  });
});
