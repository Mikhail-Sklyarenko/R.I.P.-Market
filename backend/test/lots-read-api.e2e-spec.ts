import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserRole, UserStatus } from '@prisma/client';
import request from 'supertest';
import { LedgerService } from '../src/wallet/ledger.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { ApiClient } from './helpers/api-client';
import { createE2eApp } from './helpers/bootstrap-e2e-app';
import { resetDatabase } from './helpers/reset-database';

describe('Read API extensions (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let api: ApiClient;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    api = new ApiClient(app);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  async function createSellerLot(priceMinor: number) {
    const seller = await api.login(UserRole.SELLER);
    const inventory = await api.getInventory(seller);
    const assetId = inventory.body.assets[0].id as string;
    const lot = await api.createLot(seller, assetId, priceMinor);
    return { seller, lotId: lot.body.id as string, lot: lot.body };
  }

  it('GET /lots without params returns a plain array', async () => {
    await createSellerLot(100_000);
    const response = await request(app.getHttpServer()).get('/api/v1/lots');
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBeGreaterThan(0);
    expect(response.body[0].id).toBeDefined();
  });

  it('GET /lots supports catalog filters and pagination', async () => {
    const seller = await api.login(UserRole.SELLER);
    const inventory = await api.getInventory(seller);
    const assets = inventory.body.assets as Array<{
      id: string;
      itemDefinition: { marketHashName: string };
    }>;

    const akAsset = assets.find((asset) =>
      asset.itemDefinition.marketHashName.includes('AK-47'),
    );
    const awpAsset = assets.find((asset) =>
      asset.itemDefinition.marketHashName.includes('AWP'),
    );
    const otherAsset = assets.find(
      (asset) => asset.id !== akAsset?.id && asset.id !== awpAsset?.id,
    );
    expect(akAsset).toBeDefined();
    expect(awpAsset).toBeDefined();
    expect(otherAsset).toBeDefined();

    const cheap = await api.createLot(seller, akAsset!.id, 50_000);
    const mid = await api.createLot(seller, awpAsset!.id, 150_000);
    await api.createLot(seller, otherAsset!.id, 250_000);

    const searchResponse = await request(app.getHttpServer())
      .get('/api/v1/lots')
      .query({ q: 'AK-47', page: 1, limit: 24 });

    expect(searchResponse.status).toBe(200);
    expect(searchResponse.body.items).toHaveLength(1);
    expect(searchResponse.body.items[0].id).toBe(cheap.body.id);
    expect(
      searchResponse.body.items[0].inventoryAsset.itemDefinition.marketHashName,
    ).toContain('AK-47');
    expect(searchResponse.body.total).toBe(1);

    const priceResponse = await request(app.getHttpServer())
      .get('/api/v1/lots')
      .query({
        minPriceMinor: 100_000,
        maxPriceMinor: 200_000,
        sort: 'price_desc',
      });

    expect(priceResponse.status).toBe(200);
    expect(priceResponse.body.items).toHaveLength(1);
    expect(priceResponse.body.items[0].id).toBe(mid.body.id);
    expect(priceResponse.body.limit).toBe(24);
  });

  it('GET /lots?wear filters lots by inventory wear', async () => {
    const seller = await api.login(UserRole.SELLER);
    const inventory = await api.getInventory(seller);
    const assets = inventory.body.assets as Array<{
      id: string;
      wear?: string | null;
      itemDefinition: { marketHashName: string };
    }>;

    const ftAsset = assets.find((asset) => asset.wear === 'FT');
    const bsAsset = assets.find((asset) => asset.wear === 'BS');
    const mwAsset = assets.find((asset) => asset.wear === 'MW');
    expect(ftAsset).toBeDefined();
    expect(bsAsset).toBeDefined();
    expect(mwAsset).toBeDefined();

    const ftLot = await api.createLot(seller, ftAsset!.id, 80_000);
    await api.createLot(seller, bsAsset!.id, 90_000);
    await api.createLot(seller, mwAsset!.id, 110_000);

    const allResponse = await request(app.getHttpServer())
      .get('/api/v1/lots')
      .query({ page: 1, limit: 24 });
    expect(allResponse.status).toBe(200);
    expect(allResponse.body.total).toBe(3);

    const ftResponse = await request(app.getHttpServer())
      .get('/api/v1/lots')
      .query({ wear: 'FT', page: 1, limit: 24 });
    expect(ftResponse.status).toBe(200);
    expect(ftResponse.body.total).toBe(1);
    expect(ftResponse.body.items[0].id).toBe(ftLot.body.id);
    expect(ftResponse.body.items[0].inventoryAsset.wear).toBe('FT');
  });

  async function createExtraSellerSession(suffix: string) {
    const ledger = app.get(LedgerService);
    const jwt = app.get(JwtService);
    const user = await prisma.user.create({
      data: {
        username: `seller_${suffix}`,
        steamId: `steam_seller_${suffix}`,
        role: UserRole.SELLER,
        status: UserStatus.ACTIVE,
      },
    });
    await ledger.ensureUserWallet(user.id);
    const token = await jwt.signAsync({ sub: user.id, role: UserRole.SELLER });
    return { token, userId: user.id };
  }

  it('GET /lots?similarTo returns active similar lots', async () => {
    const sellerA = await api.login(UserRole.SELLER);
    const inventoryA = await api.getInventory(sellerA);
    const akAssetId = inventoryA.body.assets[0].id as string;
    const sourceLot = await api.createLot(sellerA, akAssetId, 100_000);

    const sellerB = await createExtraSellerSession('b');
    const inventoryB = await api.getInventory(sellerB);
    const akAssetIdB = inventoryB.body.assets[0].id as string;
    const similarLot = await api.createLot(sellerB, akAssetIdB, 120_000);
    await api.createLot(
      sellerB,
      inventoryB.body.assets[1].id as string,
      130_000,
    );

    const response = await request(app.getHttpServer())
      .get('/api/v1/lots')
      .query({ similarTo: sourceLot.body.id, limit: 6 });

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].id).toBe(similarLot.body.id);
  });

  it('GET /orders/:id includes statusEvents for participants', async () => {
    const { lotId } = await createSellerLot(100_000);
    const buyer = await api.login(UserRole.BUYER);
    await api.deposit(buyer, 200_000, 'dep-read-api-1');

    const orderResponse = await api.createOrder(
      buyer,
      lotId,
      'order-read-api-1',
    );
    const orderId = orderResponse.body.id as string;

    const response = await request(app.getHttpServer())
      .get(`/api/v1/orders/${orderId}`)
      .set('Authorization', `Bearer ${buyer.token}`);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.statusEvents)).toBe(true);
    expect(response.body.statusEvents.length).toBeGreaterThanOrEqual(3);
    expect(response.body.statusEvents[0]).toMatchObject({
      toStatus: 'CREATED',
    });
  });

  it('GET /me/orders supports role and status filters', async () => {
    const { lotId, seller } = await createSellerLot(100_000);
    const buyer = await api.login(UserRole.BUYER);
    await api.deposit(buyer, 200_000, 'dep-read-api-2');
    const order = await api.createOrder(buyer, lotId, 'order-read-api-2');

    const buyerOrders = await request(app.getHttpServer())
      .get('/api/v1/me/orders')
      .query({ role: 'buyer', status: 'WAITING_TRADE' })
      .set('Authorization', `Bearer ${buyer.token}`);

    expect(buyerOrders.status).toBe(200);
    expect(buyerOrders.body).toHaveLength(1);
    expect(buyerOrders.body[0].id).toBe(order.body.id);

    const sellerOrders = await request(app.getHttpServer())
      .get('/api/v1/me/orders')
      .query({ role: 'seller' })
      .set('Authorization', `Bearer ${seller.token}`);

    expect(sellerOrders.status).toBe(200);
    expect(sellerOrders.body).toHaveLength(1);
    expect(sellerOrders.body[0].sellerId).toBe(seller.userId);
  });

  it('GET /me/notifications supports category filter', async () => {
    const { lotId } = await createSellerLot(100_000);
    const buyer = await api.login(UserRole.BUYER);
    await api.deposit(buyer, 200_000, 'dep-read-api-3');
    const order = await api.createOrder(buyer, lotId, 'order-read-api-3');

    await prisma.notification.create({
      data: {
        userId: buyer.userId,
        eventType: 'ORDER_CREATED',
        title: 'Order created',
        message: 'Your purchase order was created.',
        payload: { orderId: order.body.id },
      },
    });

    const dealsResponse = await request(app.getHttpServer())
      .get('/api/v1/me/notifications')
      .query({ category: 'deals' })
      .set('Authorization', `Bearer ${buyer.token}`);

    expect(dealsResponse.status).toBe(200);
    expect(dealsResponse.body.length).toBeGreaterThan(0);
    expect(
      dealsResponse.body.every(
        (item: { eventType: string }) =>
          item.eventType.startsWith('ORDER_') ||
          item.eventType.startsWith('TRADE_'),
      ),
    ).toBe(true);

    const moneyResponse = await request(app.getHttpServer())
      .get('/api/v1/me/notifications')
      .query({ category: 'money' })
      .set('Authorization', `Bearer ${buyer.token}`);

    expect(moneyResponse.status).toBe(200);
    expect(moneyResponse.body).toHaveLength(0);
  });
});
