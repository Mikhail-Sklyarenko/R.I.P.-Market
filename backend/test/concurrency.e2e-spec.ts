import { INestApplication } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { ApiClient } from './helpers/api-client';
import { createE2eApp } from './helpers/bootstrap-e2e-app';
import { resetDatabase } from './helpers/reset-database';

describe('Concurrency protections (e2e)', () => {
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

  it('allows only one buyer to reserve the same lot (double-buy)', async () => {
    const seller = await api.login(UserRole.SELLER);
    const buyerA = await api.login(UserRole.BUYER);
    const buyerB = await api.createBuyerSession('second');

    const inventory = await api.getInventory(seller);
    const lot = await api.createLot(seller, inventory.body[0].id, 50_000);

    await api.deposit(buyerA, 100_000, 'dep-db-a');
    await api.deposit(buyerB, 100_000, 'dep-db-b');

    const first = await api.createOrder(buyerA, lot.body.id, 'buy-db-a');
    const second = await api.createOrder(buyerB, lot.body.id, 'buy-db-b');

    expect([200, 201]).toContain(first.status);
    expect(second.status).toBe(400);

    const ordersCount = await prisma.order.count({
      where: {
        lotId: lot.body.id,
        status: { in: ['WAITING_TRADE', 'PAYMENT_RESERVED', 'CREATED'] },
      },
    });
    expect(ordersCount).toBe(1);
  });

  it('prevents double settlement on repeated mock-success', async () => {
    const seller = await api.login(UserRole.SELLER);
    const buyer = await api.login(UserRole.BUYER);

    const inventory = await api.getInventory(seller);
    const lot = await api.createLot(seller, inventory.body[0].id, 80_000);
    await api.deposit(buyer, 200_000, 'dep-ds-1');

    const order = await api.createOrder(buyer, lot.body.id, 'buy-ds-1');
    const firstSuccess = await api.mockSuccess(
      buyer,
      order.body.id,
      'settle-ds-1',
    );
    const secondSuccess = await api.mockSuccess(
      buyer,
      order.body.id,
      'settle-ds-1',
    );

    expect([200, 201]).toContain(firstSuccess.status);
    expect([200, 201]).toContain(secondSuccess.status);
    expect(firstSuccess.body.status).toBe('COMPLETED');
    expect(secondSuccess.body.status).toBe('COMPLETED');

    const settlementEntries = await prisma.ledgerEntry.count({
      where: {
        orderId: order.body.id,
        type: 'SETTLEMENT_SELLER',
      },
    });
    expect(settlementEntries).toBe(1);
  });

  it('rejects second mock-success with different idempotency key after completion', async () => {
    const seller = await api.login(UserRole.SELLER);
    const buyer = await api.login(UserRole.BUYER);

    const inventory = await api.getInventory(seller);
    const lot = await api.createLot(seller, inventory.body[0].id, 60_000);
    await api.deposit(buyer, 150_000, 'dep-ds-2');

    const order = await api.createOrder(buyer, lot.body.id, 'buy-ds-2');
    await api.mockSuccess(buyer, order.body.id, 'settle-ds-2-a');

    const secondAttempt = await api.mockSuccess(
      buyer,
      order.body.id,
      'settle-ds-2-b',
    );
    expect(secondAttempt.status).toBe(400);
  });
});
