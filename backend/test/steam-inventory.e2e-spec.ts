import { INestApplication } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import * as steamClient from '../src/providers/inventory/steam-inventory.client';
import fixture from '../src/providers/inventory/fixtures/steam-inventory-page1.json';
import { SteamInventoryResponse } from '../src/providers/inventory/steam-inventory.parser';
import { PrismaService } from '../src/prisma/prisma.service';
import { ApiClient } from './helpers/api-client';
import { createE2eApp } from './helpers/bootstrap-e2e-app';
import { resetDatabase } from './helpers/reset-database';

describe('Steam inventory (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let api: ApiClient;
  const previousInventoryProvider = process.env.INVENTORY_PROVIDER;
  let fetchSpy: jest.SpyInstance;

  beforeAll(async () => {
    process.env.INVENTORY_PROVIDER = 'steam';
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    api = new ApiClient(app);
    fetchSpy = jest
      .spyOn(steamClient, 'fetchAllSteamInventoryPages')
      .mockResolvedValue(fixture as SteamInventoryResponse);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    fetchSpy.mockClear();
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    process.env.INVENTORY_PROVIDER = previousInventoryProvider;
    await app.close();
  });

  it('syncs Steam inventory and returns assets with metadata', async () => {
    const seller = await api.login(UserRole.SELLER);

    const response = await request(app.getHttpServer())
      .get('/api/v1/inventory')
      .set('Authorization', `Bearer ${seller.token}`)
      .expect(200);

    expect(response.body.assets).toHaveLength(2);
    expect(response.body.sync.status).toBe('SUCCESS');
    expect(response.body.sync.cacheHit).toBe(false);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const tradableAsset = response.body.assets.find(
      (asset: { tradable: boolean }) => asset.tradable,
    );
    expect(tradableAsset).toBeTruthy();
  });

  it('serves cache hit on second request within TTL', async () => {
    const seller = await api.login(UserRole.SELLER);

    await request(app.getHttpServer())
      .get('/api/v1/inventory')
      .set('Authorization', `Bearer ${seller.token}`)
      .expect(200);

    const cached = await request(app.getHttpServer())
      .get('/api/v1/inventory')
      .set('Authorization', `Bearer ${seller.token}`)
      .expect(200);

    expect(cached.body.sync.status).toBe('CACHE_HIT');
    expect(cached.body.sync.cacheHit).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('blocks listing a non-tradable synced asset', async () => {
    const seller = await api.login(UserRole.SELLER);

    const inventory = await request(app.getHttpServer())
      .get('/api/v1/inventory')
      .set('Authorization', `Bearer ${seller.token}`)
      .expect(200);

    const lockedAsset = inventory.body.assets.find(
      (asset: { tradable: boolean }) => !asset.tradable,
    );
    expect(lockedAsset).toBeTruthy();

    const lotResponse = await request(app.getHttpServer())
      .post('/api/v1/lots')
      .set('Authorization', `Bearer ${seller.token}`)
      .send({ inventoryAssetId: lockedAsset.id, priceMinor: 100_000 });

    expect(lotResponse.status).toBe(400);
    expect(lotResponse.body.error.code).toBe('INVENTORY_ASSET_NOT_TRADABLE');
  });

  it('blocks listing a trade-locked asset after sync', async () => {
    const seller = await api.login(UserRole.SELLER);

    const inventory = await request(app.getHttpServer())
      .get('/api/v1/inventory')
      .set('Authorization', `Bearer ${seller.token}`)
      .expect(200);

    const asset = inventory.body.assets.find(
      (item: { tradable: boolean }) => item.tradable,
    );

    await prisma.inventoryAsset.update({
      where: { id: asset.id },
      data: {
        tradeLockUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    const lotResponse = await request(app.getHttpServer())
      .post('/api/v1/lots')
      .set('Authorization', `Bearer ${seller.token}`)
      .send({ inventoryAssetId: asset.id, priceMinor: 100_000 });

    expect(lotResponse.status).toBe(400);
    expect(lotResponse.body.error.code).toBe('INVENTORY_ASSET_TRADE_LOCKED');
  });

  it('returns STEAM_PROFILE_PRIVATE when inventory is private and no cache exists', async () => {
    fetchSpy.mockImplementationOnce(() => {
      const error = new Error('Steam inventory is private');
      (error as Error & { code: string }).code = 'STEAM_PROFILE_PRIVATE';
      return Promise.reject(error);
    });

    const seller = await api.login(UserRole.SELLER);

    const response = await request(app.getHttpServer())
      .get('/api/v1/inventory')
      .set('Authorization', `Bearer ${seller.token}`)
      .expect(400);

    expect(response.body.error.code).toBe('STEAM_PROFILE_PRIVATE');
  });

  it('rejects forceRefresh for buyers', async () => {
    const buyer = await api.login(UserRole.BUYER);

    const response = await request(app.getHttpServer())
      .get('/api/v1/inventory?forceRefresh=true')
      .set('Authorization', `Bearer ${buyer.token}`)
      .expect(403);

    expect(response.body.error.code).toBe('FORBIDDEN');
  });
});
