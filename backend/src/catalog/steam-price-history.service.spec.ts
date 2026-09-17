import { SteamPriceHistoryService } from './steam-price-history.service';

describe('SteamPriceHistoryService pct math (via getChangePcts shape)', () => {
  it('computes rounded one-decimal percent change', async () => {
    const prisma = {
      steamPriceSnapshot: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      $queryRaw: jest
        .fn()
        // 7d anchors
        .mockResolvedValueOnce([
          { marketHashName: 'AK', priceMinor: 1000 },
        ])
        // 30d anchors
        .mockResolvedValueOnce([
          { marketHashName: 'AK', priceMinor: 800 },
        ]),
    };
    const service = new SteamPriceHistoryService(prisma as never);
    const result = await service.getChangePcts(['AK'], { AK: 1100 });
    expect(result.AK.steamPriceChange7dPct).toBe(10);
    expect(result.AK.steamPriceChange30dPct).toBe(37.5);
  });

  it('skips snapshot when price unchanged within 24h', async () => {
    const prisma = {
      steamPriceSnapshot: {
        findFirst: jest.fn().mockResolvedValue({
          priceMinor: 500,
          recordedAt: new Date(),
        }),
        create: jest.fn(),
      },
      $queryRaw: jest.fn(),
    };
    const service = new SteamPriceHistoryService(prisma as never);
    await service.recordSnapshotIfNeeded('AK', 500);
    expect(prisma.steamPriceSnapshot.create).not.toHaveBeenCalled();
  });

  it('writes snapshot when price changes', async () => {
    const prisma = {
      steamPriceSnapshot: {
        findFirst: jest.fn().mockResolvedValue({
          priceMinor: 500,
          recordedAt: new Date(),
        }),
        create: jest.fn().mockResolvedValue({}),
      },
      $queryRaw: jest.fn(),
    };
    const service = new SteamPriceHistoryService(prisma as never);
    await service.recordSnapshotIfNeeded('AK', 550);
    expect(prisma.steamPriceSnapshot.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          marketHashName: 'AK',
          priceMinor: 550,
        }),
      }),
    );
  });
});
