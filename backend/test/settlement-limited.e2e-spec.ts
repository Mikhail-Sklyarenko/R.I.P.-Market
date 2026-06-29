import { INestApplication } from '@nestjs/common';
import { OrderStatus, TradeOperationStatus, UserRole } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from '../src/prisma/prisma.service';
import { ApiClient } from './helpers/api-client';
import { createE2eApp } from './helpers/bootstrap-e2e-app';
import { resetDatabase } from './helpers/reset-database';

describe('Limited real settlement (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let api: ApiClient;
  const envBackup = {
    tradeProvider: process.env.TRADE_PROVIDER,
    verificationMode: process.env.TRADE_VERIFICATION_MODE,
    realSettlement: process.env.ENABLE_REAL_SETTLEMENT,
    allowlist: process.env.STEAM_SETTLEMENT_ALLOWLIST_STEAM_IDS,
    maxDailyOrders: process.env.STEAM_SETTLEMENT_MAX_DAILY_ORDERS,
    maxOrderMinor: process.env.STEAM_SETTLEMENT_MAX_ORDER_MINOR,
    maxDailyVolume: process.env.STEAM_SETTLEMENT_MAX_DAILY_VOLUME_MINOR,
  };

  const buyerSteamId = '76561198000000001';
  const sellerSteamId = '76561198000000002';
  const outsiderSteamId = '76561198000000099';
  const orderAmountMinor = 10_000;

  beforeAll(async () => {
    process.env.TRADE_PROVIDER = 'steam';
    process.env.TRADE_VERIFICATION_MODE = 'live';
    process.env.ENABLE_REAL_SETTLEMENT = 'true';
    process.env.STEAM_SETTLEMENT_ALLOWLIST_STEAM_IDS = `${buyerSteamId},${sellerSteamId}`;
    process.env.STEAM_SETTLEMENT_MAX_DAILY_ORDERS = '3';
    process.env.STEAM_SETTLEMENT_MAX_ORDER_MINOR = '50000';
    process.env.STEAM_SETTLEMENT_MAX_DAILY_VOLUME_MINOR = '150000';
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    api = new ApiClient(app);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    process.env.TRADE_PROVIDER = envBackup.tradeProvider;
    process.env.TRADE_VERIFICATION_MODE = envBackup.verificationMode;
    process.env.ENABLE_REAL_SETTLEMENT = envBackup.realSettlement;
    process.env.STEAM_SETTLEMENT_ALLOWLIST_STEAM_IDS = envBackup.allowlist;
    process.env.STEAM_SETTLEMENT_MAX_DAILY_ORDERS = envBackup.maxDailyOrders;
    process.env.STEAM_SETTLEMENT_MAX_ORDER_MINOR = envBackup.maxOrderMinor;
    process.env.STEAM_SETTLEMENT_MAX_DAILY_VOLUME_MINOR =
      envBackup.maxDailyVolume;
    await app.close();
  });

  async function createOrderWithSteamIds(options?: {
    buyerSteamId?: string;
    sellerSteamId?: string;
  }) {
    const seller = await api.login(UserRole.SELLER);
    const buyer = await api.login(UserRole.BUYER);
    await prisma.user.update({
      where: { id: seller.userId },
      data: { steamId: options?.sellerSteamId ?? sellerSteamId },
    });
    await prisma.user.update({
      where: { id: buyer.userId },
      data: { steamId: options?.buyerSteamId ?? buyerSteamId },
    });
    const inventory = await api.getInventory(seller);
    const assetId = inventory.body.assets[0].id as string;
    const lot = await api.createLot(seller, assetId, orderAmountMinor);
    await api.deposit(buyer, 250_000, 'settle-dep');
    const order = await api.createOrder(buyer, lot.body.id, 'settle-buy');
    return { buyer, seller, orderId: order.body.id as string };
  }

  async function markTradeConfirmed(orderId: string) {
    await prisma.tradeOperation.update({
      where: { orderId },
      data: { status: TradeOperationStatus.CONFIRMED },
    });
    await prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.TRADE_CONFIRMED },
    });
  }

  it('settles allowlisted buyer+seller via admin retry', async () => {
    const { orderId } = await createOrderWithSteamIds();
    await markTradeConfirmed(orderId);
    const admin = await api.login(UserRole.ADMIN);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/admin/orders/${orderId}/retry-settlement`)
      .set('Authorization', `Bearer ${admin.token}`)
      .set('Idempotency-Key', 'settle-retry-1')
      .send({})
      .expect(201);

    expect(response.body.order.status).toBe('COMPLETED');

    const settlement = await prisma.ledgerEntry.findFirst({
      where: { orderId, type: 'SETTLEMENT_SELLER' },
    });
    expect(settlement).toBeTruthy();
  });

  it('blocks settlement for non-allowlisted seller', async () => {
    const { orderId } = await createOrderWithSteamIds({
      sellerSteamId: outsiderSteamId,
    });
    await markTradeConfirmed(orderId);
    const admin = await api.login(UserRole.ADMIN);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/admin/orders/${orderId}/retry-settlement`)
      .set('Authorization', `Bearer ${admin.token}`)
      .set('Idempotency-Key', 'settle-retry-blocked')
      .send({})
      .expect(201);

    expect(response.body.order.status).toBe('TRADE_CONFIRMED');
    expect(response.body.settlement.allowed).toBe(false);

    const outbox = await prisma.outboxEvent.findFirst({
      where: { eventType: 'SETTLEMENT_BLOCKED', aggregateId: orderId },
    });
    expect(outbox).toBeTruthy();
  });

  it('enforces daily order limit', async () => {
    const admin = await api.login(UserRole.ADMIN);
    await prisma.settlementDailyStats.create({
      data: {
        day: new Date().toISOString().slice(0, 10),
        orderCount: 3,
        volumeMinor: 0n,
      },
    });

    const { orderId } = await createOrderWithSteamIds();
    await markTradeConfirmed(orderId);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/admin/orders/${orderId}/retry-settlement`)
      .set('Authorization', `Bearer ${admin.token}`)
      .set('Idempotency-Key', 'settle-retry-limit')
      .send({})
      .expect(201);

    expect(response.body.order.status).toBe('TRADE_CONFIRMED');
    expect(response.body.settlement.allowed).toBe(false);
    expect(response.body.settlement.code).toBe('DAILY_ORDER_LIMIT');
  });

  it('enforces daily volume limit', async () => {
    const admin = await api.login(UserRole.ADMIN);
    await prisma.settlementDailyStats.create({
      data: {
        day: new Date().toISOString().slice(0, 10),
        orderCount: 0,
        volumeMinor: 145_000n,
      },
    });

    const { orderId } = await createOrderWithSteamIds();
    await markTradeConfirmed(orderId);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/admin/orders/${orderId}/retry-settlement`)
      .set('Authorization', `Bearer ${admin.token}`)
      .set('Idempotency-Key', 'settle-retry-volume')
      .send({})
      .expect(201);

    expect(response.body.order.status).toBe('TRADE_CONFIRMED');
    expect(response.body.settlement.allowed).toBe(false);
    expect(response.body.settlement.code).toBe('DAILY_VOLUME_LIMIT');
  });

  it('exposes settlement eligibility for allowlisted user', async () => {
    const buyer = await api.login(UserRole.BUYER);
    await prisma.user.update({
      where: { id: buyer.userId },
      data: { steamId: buyerSteamId },
    });

    const response = await request(app.getHttpServer())
      .get('/api/v1/settlement/my-eligibility')
      .set('Authorization', `Bearer ${buyer.token}`)
      .expect(200);

    expect(response.body.realSettlementEnabled).toBe(true);
    expect(response.body.allowlisted).toBe(true);
    expect(response.body.bannerVisible).toBe(true);
  });

  it('rejects mock-success for buyer in live real settlement mode', async () => {
    const { buyer, orderId } = await createOrderWithSteamIds();

    const response = await api.mockSuccess(buyer, orderId, 'mock-blocked');
    expect(response.status).toBe(400);
  });
});
