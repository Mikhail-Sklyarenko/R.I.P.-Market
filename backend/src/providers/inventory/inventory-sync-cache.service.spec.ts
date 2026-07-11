import { InventorySyncStatus } from '@prisma/client';
import {
  getInventorySyncMinIntervalMs,
  getInventorySyncTtlMs,
  InventorySyncCacheService,
} from './inventory-sync-cache.service';

describe('InventorySyncCacheService', () => {
  const prisma = {
    inventorySyncRun: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
  };
  let service: InventorySyncCacheService;

  beforeEach(() => {
    service = new InventorySyncCacheService(prisma as never);
  });

  it('computes default TTL and min interval from env fallbacks', () => {
    expect(getInventorySyncTtlMs()).toBeGreaterThan(0);
    expect(getInventorySyncMinIntervalMs()).toBeGreaterThan(0);
  });

  it('records run with expiresAt based on TTL', async () => {
    const fetchedAt = new Date('2026-06-26T12:00:00Z');
    prisma.inventorySyncRun.create.mockResolvedValue({
      status: InventorySyncStatus.SUCCESS,
      itemCount: 3,
      fetchedAt,
      expiresAt: new Date(fetchedAt.getTime() + getInventorySyncTtlMs()),
    });

    await service.recordRun({
      userId: 'user-1',
      steamId: '76561198000000000',
      status: InventorySyncStatus.SUCCESS,
      itemCount: 3,
      fetchedAt,
    });

    expect(prisma.inventorySyncRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        steamId: '76561198000000000',
        status: InventorySyncStatus.SUCCESS,
        itemCount: 3,
        fetchedAt,
        expiresAt: new Date(fetchedAt.getTime() + getInventorySyncTtlMs()),
      }),
    });
  });

  it('treats successful unexpired runs as cache valid', () => {
    const run = {
      status: InventorySyncStatus.SUCCESS,
      expiresAt: new Date(Date.now() + 60_000),
    };
    expect(service.isCacheValid(run)).toBe(true);
  });

  it('treats expired successful runs as invalid cache', () => {
    const run = {
      status: InventorySyncStatus.SUCCESS,
      expiresAt: new Date(Date.now() - 1_000),
    };
    expect(service.isCacheValid(run)).toBe(false);
  });

  it('detects rate limit window from fetchedAt', () => {
    const now = new Date('2026-06-26T12:01:00Z');
    const minInterval = getInventorySyncMinIntervalMs();
    const recent = {
      fetchedAt: new Date(now.getTime() - minInterval / 2),
    };
    const old = {
      fetchedAt: new Date(now.getTime() - minInterval * 2),
    };

    expect(service.isWithinRateLimit(recent, now)).toBe(true);
    expect(service.isWithinRateLimit(old, now)).toBe(false);
  });
});
