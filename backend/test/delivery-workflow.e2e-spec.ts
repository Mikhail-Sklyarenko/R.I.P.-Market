import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { ApiClient } from './helpers/api-client';
import { createE2eApp } from './helpers/bootstrap-e2e-app';
import { resetDatabase } from './helpers/reset-database';

// setup-e2e rejects every database except local disposable p2pcs_e2e.
describe('Delivery workflow database invariants', () => {
  let app: INestApplication<App>;
  let db: PrismaService;
  let api: ApiClient;
  beforeAll(async () => {
    app = await createE2eApp();
    db = app.get(PrismaService);
    api = new ApiClient(app);
  });
  beforeEach(async () => resetDatabase(db));
  afterAll(async () => {
    if (app) await app.close();
  });
  async function operation() {
    const seller = await api.login(UserRole.SELLER);
    const buyer = await api.login(UserRole.BUYER);
    const inventory = await api.getInventory(seller);
    const lot = await api.createLot(
      seller,
      inventory.body.assets[0].id as string,
      100000,
    );
    await api.deposit(buyer, 250000, 'workflow-deposit');
    const order = await api.createOrder(buyer, lot.body.id, 'workflow-order');
    return db.tradeOperation.findUniqueOrThrow({
      where: { orderId: order.body.id as string },
    });
  }
  it('database prevents replacement or removal of a saved proof', async () => {
    const op = await operation();
    const proof = {
      version: 2,
      offerId: 'fixture-offer',
      mappingMethod: 'INVENTORY_DELTA',
    };
    await db.tradeOperation.update({
      where: { id: op.id },
      data: { deliveryProof: proof },
    });
    await expect(
      db.tradeOperation.update({
        where: { id: op.id },
        data: { deliveryProof: { version: 3 } },
      }),
    ).rejects.toThrow();
    expect(
      (await db.tradeOperation.findUniqueOrThrow({ where: { id: op.id } }))
        .deliveryProof,
    ).toEqual(proof);
  });
  it('concurrent lease claims admit one worker and reject a stale fencing token', async () => {
    const op = await operation();
    const claim = (token: string) =>
      db.tradeOperation.updateMany({
        where: { id: op.id, verificationLeaseUntil: null },
        data: {
          verificationLeaseUntil: new Date(Date.now() + 300000),
          verificationLeaseToken: token,
        },
      });
    const counts = await Promise.all([claim('worker-a'), claim('worker-b')]);
    expect(counts.reduce((sum, row) => sum + row.count, 0)).toBe(1);
    const saved = await db.tradeOperation.findUniqueOrThrow({
      where: { id: op.id },
    });
    const stale =
      saved.verificationLeaseToken === 'worker-a' ? 'worker-b' : 'worker-a';
    expect(
      (
        await db.tradeOperation.updateMany({
          where: { id: op.id, verificationLeaseToken: stale },
          data: { verificationLeaseToken: null, verificationLeaseUntil: null },
        })
      ).count,
    ).toBe(0);
    expect(
      (await db.tradeOperation.findUniqueOrThrow({ where: { id: op.id } }))
        .verificationLeaseToken,
    ).toBe(saved.verificationLeaseToken);
  });
});
