import { INestApplication } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { LedgerReconciliationService } from '../src/wallet/ledger-reconciliation.service';
import { ApiClient } from './helpers/api-client';
import { createE2eApp } from './helpers/bootstrap-e2e-app';
import { resetDatabase } from './helpers/reset-database';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Ledger reconciliation (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let api: ApiClient;
  let reconciliation: LedgerReconciliationService;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    api = new ApiClient(app);
    reconciliation = app.get(LedgerReconciliationService);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  async function setupCompletedTrade() {
    const seller = await api.login(UserRole.SELLER);
    const buyer = await api.login(UserRole.BUYER);
    const inventory = await api.getInventory(seller);
    const assetId = inventory.body.assets[0].id;
    const priceMinor = 100_000;
    const lot = await api.createLot(seller, assetId, priceMinor);
    await api.deposit(buyer, priceMinor * 2, 'reconcile-dep-1');
    const order = await api.createOrder(
      buyer,
      lot.body.id as string,
      'reconcile-buy-1',
    );
    await api.mockSuccess(buyer, order.body.id, 'reconcile-trade-1');
    return { seller, buyer, orderId: order.body.id as string };
  }

  it('passes after happy-path trade', async () => {
    await setupCompletedTrade();
    const report = await reconciliation.reconcile();
    expect(report.ok).toBe(true);
    expect(report.issueCount).toBe(0);
  });

  it('admin endpoint returns reconciliation report', async () => {
    await setupCompletedTrade();
    const admin = await api.login(UserRole.ADMIN);

    const response = await request(app.getHttpServer())
      .post('/api/v1/admin/reconciliation/ledger')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(201);

    expect(response.body.ok).toBe(true);
    expect(response.body.issueCount).toBe(0);
  });
});
