import { INestApplication } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { ApiClient } from './helpers/api-client';
import { createE2eApp } from './helpers/bootstrap-e2e-app';
import { resetDatabase } from './helpers/reset-database';

describe('Extension-first state machine smoke (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let api: ApiClient;

  beforeAll(async () => {
    process.env.ENABLE_EXTENSION_FIRST_TRADE_FLOW = 'true';
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    api = new ApiClient(app);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    delete process.env.ENABLE_EXTENSION_FIRST_TRADE_FLOW;
    await app.close();
  });

  async function setupOrder(priceMinor = 100_000) {
    const seller = await api.login(UserRole.SELLER);
    const buyer = await api.login(UserRole.BUYER);
    const inventory = await api.getInventory(seller);
    const assetId = inventory.body.assets[0].id;
    const lot = await api.createLot(seller, assetId, priceMinor);
    await api.deposit(buyer, priceMinor * 2, `dep-${Date.now()}`);
    const orderResponse = await api.createOrder(
      buyer,
      lot.body.id,
      `buy-${Date.now()}`,
    );
    return { seller, buyer, orderId: orderResponse.body.id as string };
  }

  it('happy-path reaches SETTLEMENT_HOLD and COMPLETED', async () => {
    const { buyer, orderId } = await setupOrder();

    const successResponse = await api.mockSuccess(
      buyer,
      orderId,
      `trade-success-${Date.now()}`,
    );
    expect([200, 201]).toContain(successResponse.status);
    expect(successResponse.body.status).toBe('COMPLETED');

    const orderEvents = await prisma.orderStatusEvent.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
    });
    expect(orderEvents.map((event) => event.toStatus)).toEqual([
      'CREATED',
      'PAYMENT_RESERVED',
      'WAITING_TRADE',
      'TRADE_CONFIRMED',
      'SETTLEMENT_HOLD',
      'COMPLETED',
    ]);
  });

  it('timeout-path moves order to DISPUTE', async () => {
    const { buyer, orderId } = await setupOrder();

    const timeoutResponse = await api.mockTimeout(
      buyer,
      orderId,
      `trade-timeout-${Date.now()}`,
    );
    expect([200, 201]).toContain(timeoutResponse.status);
    expect(timeoutResponse.body.status).toBe('DISPUTE');

    const orderEvents = await prisma.orderStatusEvent.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
    });
    expect(orderEvents.map((event) => event.toStatus)).toContain('DISPUTE');
  });
});
