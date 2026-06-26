import { INestApplication } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from '../src/prisma/prisma.service';
import { ApiClient } from './helpers/api-client';
import { createE2eApp } from './helpers/bootstrap-e2e-app';
import { resetDatabase } from './helpers/reset-database';

describe('Trade poll (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let api: ApiClient;
  const previousTradeProvider = process.env.TRADE_PROVIDER;

  beforeAll(async () => {
    process.env.TRADE_PROVIDER = 'steam';
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    api = new ApiClient(app);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    process.env.TRADE_PROVIDER = previousTradeProvider;
    await app.close();
  });

  async function createWaitingTradeOrder() {
    const seller = await api.login(UserRole.SELLER);
    const buyer = await api.login(UserRole.BUYER);
    const inventory = await api.getInventory(seller);
    const assetId = inventory.body.assets[0].id as string;
    const lot = await api.createLot(seller, assetId, 100_000);
    await api.deposit(buyer, 250_000, 'trade-poll-dep');
    const order = await api.createOrder(buyer, lot.body.id, 'trade-poll-buy');
    return { seller, buyer, orderId: order.body.id as string };
  }

  it('creates trade operation with STEAM_POLL verification mode', async () => {
    const { orderId } = await createWaitingTradeOrder();

    const operation = await prisma.tradeOperation.findFirst({
      where: { orderId },
    });

    expect(operation?.verificationMode).toBe('STEAM_POLL');
    expect(operation?.status).toBe('WAITING');
  });

  it('saves trade offer id from seller trade-reference', async () => {
    const { seller, orderId } = await createWaitingTradeOrder();

    const response = await request(app.getHttpServer())
      .patch(`/api/v1/orders/${orderId}/trade-reference`)
      .set('Authorization', `Bearer ${seller.token}`)
      .send({ offerId: '8301234567' })
      .expect(200);

    expect(response.body.tradeOperation.externalOfferId).toBe('8301234567');
  });

  it('parses trade offer id from Steam trade URL', async () => {
    const { seller, orderId } = await createWaitingTradeOrder();

    const response = await request(app.getHttpServer())
      .patch(`/api/v1/orders/${orderId}/trade-reference`)
      .set('Authorization', `Bearer ${seller.token}`)
      .send({
        tradeUrl: 'https://steamcommunity.com/tradeoffer/8309876543/',
      })
      .expect(200);

    expect(response.body.tradeOperation.externalOfferId).toBe('8309876543');
  });

  it('rejects trade-reference without offer id or url', async () => {
    const { seller, orderId } = await createWaitingTradeOrder();

    const response = await request(app.getHttpServer())
      .patch(`/api/v1/orders/${orderId}/trade-reference`)
      .set('Authorization', `Bearer ${seller.token}`)
      .send({ tradeUrl: 'not-a-valid-url' })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});
