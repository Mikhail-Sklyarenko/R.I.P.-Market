import { INestApplication } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { NotificationsService } from '../src/notifications/notifications.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { ApiClient } from './helpers/api-client';
import { createE2eApp } from './helpers/bootstrap-e2e-app';
import { resetDatabase } from './helpers/reset-database';

describe('Shadow mode (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let api: ApiClient;
  let notificationsService: NotificationsService;
  const envBackup = {
    tradeProvider: process.env.TRADE_PROVIDER,
    verificationMode: process.env.TRADE_VERIFICATION_MODE,
    realSettlement: process.env.ENABLE_REAL_SETTLEMENT,
  };

  beforeAll(async () => {
    process.env.TRADE_PROVIDER = 'steam';
    process.env.TRADE_VERIFICATION_MODE = 'shadow';
    process.env.ENABLE_REAL_SETTLEMENT = 'false';
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    api = new ApiClient(app);
    notificationsService = app.get(NotificationsService);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    process.env.TRADE_PROVIDER = envBackup.tradeProvider;
    process.env.TRADE_VERIFICATION_MODE = envBackup.verificationMode;
    process.env.ENABLE_REAL_SETTLEMENT = envBackup.realSettlement;
    await app.close();
  });

  async function createShadowOrder() {
    const seller = await api.login(UserRole.SELLER);
    const buyer = await api.login(UserRole.BUYER);
    const inventory = await api.getInventory(seller);
    const assetId = inventory.body.assets[0].id as string;
    const lot = await api.createLot(seller, assetId, 100_000);
    await api.deposit(buyer, 250_000, 'shadow-dep');
    const order = await api.createOrder(buyer, lot.body.id, 'shadow-buy');
    return { seller, buyer, orderId: order.body.id as string };
  }

  it('creates orders with SHADOW verification mode', async () => {
    const { orderId } = await createShadowOrder();
    const operation = await prisma.tradeOperation.findFirst({
      where: { orderId },
    });
    expect(operation?.verificationMode).toBe('SHADOW');
  });

  it('mock-success in shadow records snapshot without changing order or ledger', async () => {
    const { buyer, orderId } = await createShadowOrder();
    const walletBefore = await api.getWallet(buyer);

    await prisma.tradeVerificationSnapshot.create({
      data: {
        orderId,
        source: 'STEAM_POLL',
        observedStatus: 'pending',
        expectedStatus: 'pending',
        match: true,
        payload: { strategy: 'OFFER_POLL' },
      },
    });

    const response = await api.mockSuccess(buyer, orderId, 'shadow-mock-1');
    expect(response.status).toBe(201);

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order?.status).toBe('WAITING_TRADE');

    const walletAfter = await api.getWallet(buyer);
    expect(walletAfter.body.summary).toEqual(walletBefore.body.summary);

    const mockSnapshot = await prisma.tradeVerificationSnapshot.findFirst({
      where: { orderId, source: 'MOCK_MANUAL' },
      orderBy: { createdAt: 'desc' },
    });
    expect(mockSnapshot?.observedStatus).toBe('accepted');
    expect(mockSnapshot?.expectedStatus).toBe('pending');
    expect(mockSnapshot?.match).toBe(false);

    const outbox = await prisma.outboxEvent.findFirst({
      where: { eventType: 'TRADE_SHADOW_MISMATCH', aggregateId: orderId },
    });
    expect(outbox).toBeTruthy();
  });

  it('mismatch generates admin notification after outbox processing', async () => {
    const { buyer, orderId } = await createShadowOrder();
    const admin = await api.login(UserRole.ADMIN);

    await prisma.tradeVerificationSnapshot.create({
      data: {
        orderId,
        source: 'STEAM_POLL',
        observedStatus: 'pending',
        expectedStatus: 'pending',
        match: true,
        payload: {},
      },
    });

    await api.mockSuccess(buyer, orderId, 'shadow-mock-notify');

    const outbox = await prisma.outboxEvent.findFirst({
      where: { eventType: 'TRADE_SHADOW_MISMATCH', aggregateId: orderId },
    });
    expect(outbox).toBeTruthy();
    await notificationsService.createFromOutboxEvent(
      outbox!.eventType,
      outbox!.aggregateType,
      outbox!.aggregateId,
      outbox!.payload,
    );

    const notifications = await prisma.notification.findMany({
      where: { userId: admin.userId, eventType: 'TRADE_SHADOW_MISMATCH' },
    });
    expect(notifications.length).toBeGreaterThan(0);
  });

  it('admin can apply observed accepted status without settlement', async () => {
    const { orderId } = await createShadowOrder();
    const admin = await api.login(UserRole.ADMIN);

    await prisma.tradeVerificationSnapshot.create({
      data: {
        orderId,
        source: 'STEAM_POLL',
        observedStatus: 'accepted',
        expectedStatus: 'pending',
        match: false,
        payload: { strategy: 'OFFER_POLL' },
      },
    });

    const response = await request(app.getHttpServer())
      .post(`/api/v1/admin/orders/${orderId}/apply-observed-status`)
      .set('Authorization', `Bearer ${admin.token}`)
      .set('Idempotency-Key', 'shadow-apply-1')
      .send({})
      .expect(201);

    expect(response.body.order.status).toBe('TRADE_CONFIRMED');

    const settlement = await prisma.ledgerEntry.findFirst({
      where: { orderId, type: 'SETTLEMENT_SELLER' },
    });
    expect(settlement).toBeNull();
  });

  it('reports shadow mismatches in dashboard metrics', async () => {
    const { buyer, orderId } = await createShadowOrder();
    const admin = await api.login(UserRole.ADMIN);

    await prisma.tradeVerificationSnapshot.create({
      data: {
        orderId,
        source: 'STEAM_POLL',
        observedStatus: 'pending',
        expectedStatus: 'pending',
        match: true,
        payload: {},
      },
    });
    await api.mockSuccess(buyer, orderId, 'shadow-metrics');

    const response = await request(app.getHttpServer())
      .get('/api/v1/admin/metrics/shadow')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);

    expect(response.body.mismatchesLast7d).toBeGreaterThanOrEqual(1);
  });
});
