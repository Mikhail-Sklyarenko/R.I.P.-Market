import { INestApplication } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { ApiClient } from './helpers/api-client';
import { createE2eApp } from './helpers/bootstrap-e2e-app';
import { resetDatabase } from './helpers/reset-database';

describe('MVP core flows (e2e)', () => {
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

  async function setupActiveLot(priceMinor = 100_000) {
    const seller = await api.login(UserRole.SELLER);
    const inventory = await api.getInventory(seller);
    const assetId = inventory.body[0].id;
    const lot = await api.createLot(seller, assetId, priceMinor);
    return { seller, lotId: lot.body.id as string, priceMinor };
  }

  it('happy path: lot -> order -> mock-success -> completed', async () => {
    const { lotId, priceMinor } = await setupActiveLot();
    const buyer = await api.login(UserRole.BUYER);
    const seller = await api.login(UserRole.SELLER);

    await api.deposit(buyer, priceMinor * 2, 'dep-happy-1');

    const orderResponse = await api.createOrder(buyer, lotId, 'buy-happy-1');
    expect([200, 201]).toContain(orderResponse.status);
    expect(orderResponse.body.status).toBe('WAITING_TRADE');

    const successResponse = await api.mockSuccess(
      buyer,
      orderResponse.body.id,
      'trade-success-1',
    );
    expect([200, 201]).toContain(successResponse.status);
    expect(successResponse.body.status).toBe('COMPLETED');
    expect(successResponse.body.lot.status).toBe('SOLD');

    const buyerWallet = await api.getWallet(buyer);
    const sellerWallet = await api.getWallet(seller);

    const buyerAvailable = Number(
      buyerWallet.body.accounts.find(
        (a: { type: string }) => a.type === 'AVAILABLE',
      ).balanceMinor,
    );
    const sellerAvailable = Number(
      sellerWallet.body.accounts.find(
        (a: { type: string }) => a.type === 'AVAILABLE',
      ).balanceMinor,
    );

    expect(buyerAvailable).toBe(priceMinor);
    expect(sellerAvailable).toBe(Math.floor(priceMinor * 0.95));

    const orderEvents = await prisma.orderStatusEvent.findMany({
      where: { orderId: orderResponse.body.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(orderEvents.map((event) => event.toStatus)).toEqual([
      'CREATED',
      'PAYMENT_RESERVED',
      'WAITING_TRADE',
      'TRADE_CONFIRMED',
      'COMPLETED',
    ]);

    const lotEvents = await prisma.lotStatusEvent.findMany({
      where: { lotId },
      orderBy: { createdAt: 'asc' },
    });
    expect(lotEvents.map((event) => event.toStatus)).toEqual([
      'ACTIVE',
      'RESERVED',
      'SOLD',
    ]);
  });

  it('fail safe path: refund buyer and reopen lot', async () => {
    const { lotId, priceMinor } = await setupActiveLot();
    const buyer = await api.login(UserRole.BUYER);

    await api.deposit(buyer, priceMinor, 'dep-fail-safe-1');
    const orderResponse = await api.createOrder(
      buyer,
      lotId,
      'buy-fail-safe-1',
    );

    const failResponse = await api.mockFail(
      buyer,
      orderResponse.body.id,
      'trade-fail-safe-1',
      'SAFE',
    );
    expect([200, 201]).toContain(failResponse.status);
    expect(failResponse.body.status).toBe('FAILED');
    expect(failResponse.body.lot.status).toBe('ACTIVE');

    const buyerWallet = await api.getWallet(buyer);
    const available = Number(
      buyerWallet.body.accounts.find(
        (a: { type: string }) => a.type === 'AVAILABLE',
      ).balanceMinor,
    );
    expect(available).toBe(priceMinor);
  });

  it('dispute path: admin resolves in favor of buyer', async () => {
    const { lotId, priceMinor } = await setupActiveLot();
    const buyer = await api.login(UserRole.BUYER);
    const admin = await api.login(UserRole.ADMIN);

    await api.deposit(buyer, priceMinor, 'dep-dispute-1');
    const orderResponse = await api.createOrder(buyer, lotId, 'buy-dispute-1');
    await api.mockFail(
      buyer,
      orderResponse.body.id,
      'trade-fail-dispute-1',
      'DISPUTE',
    );

    const resolveResponse = await api.adminResolveDispute(
      admin,
      orderResponse.body.id,
      'BUYER',
      'resolve-buyer-1',
    );

    expect([200, 201]).toContain(resolveResponse.status);
    expect(resolveResponse.body.order.status).toBe('FAILED');
    expect(resolveResponse.body.order.lot.status).toBe('ACTIVE');

    const buyerWallet = await api.getWallet(buyer);
    const available = Number(
      buyerWallet.body.accounts.find(
        (a: { type: string }) => a.type === 'AVAILABLE',
      ).balanceMinor,
    );
    expect(available).toBe(priceMinor);
  });

  it('dispute path: admin resolves in favor of seller', async () => {
    const { lotId, priceMinor, seller } = await setupActiveLot();
    const buyer = await api.login(UserRole.BUYER);
    const admin = await api.login(UserRole.ADMIN);

    await api.deposit(buyer, priceMinor, 'dep-dispute-seller-1');
    const orderResponse = await api.createOrder(
      buyer,
      lotId,
      'buy-dispute-seller-1',
    );
    await api.mockFail(
      buyer,
      orderResponse.body.id,
      'trade-fail-dispute-seller-1',
      'DISPUTE',
    );

    const resolveResponse = await api.adminResolveDispute(
      admin,
      orderResponse.body.id,
      'SELLER',
      'resolve-seller-1',
    );

    expect([200, 201]).toContain(resolveResponse.status);
    expect(resolveResponse.body.order.status).toBe('COMPLETED');
    expect(resolveResponse.body.order.lot.status).toBe('SOLD');

    const sellerWallet = await api.getWallet(seller);
    const sellerAvailable = Number(
      sellerWallet.body.accounts.find(
        (a: { type: string }) => a.type === 'AVAILABLE',
      ).balanceMinor,
    );
    expect(sellerAvailable).toBe(Math.floor(priceMinor * 0.95));
  });
});
