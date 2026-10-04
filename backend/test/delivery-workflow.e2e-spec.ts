import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { ApiClient } from './helpers/api-client';
import { createE2eApp } from './helpers/bootstrap-e2e-app';
import { resetDatabase } from './helpers/reset-database';
import { DeliveryWorkflowService } from '../src/trades/delivery-workflow.service';
import { TradesService } from '../src/trades/trades.service';
import { TradeStatusPollerService } from '../src/trades/trade-status-poller.service';

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

  it.each([false, true])(
    'receipt without destination enters hold; crash after proof=%s',
    async (crashAfterProof) => {
      const op = await operation();
      const order = await db.order.findUniqueOrThrow({
        where: { id: op.orderId },
      });
      const sellerSteamId = '76561198000000101',
        buyerSteamId = '76561198000000102';
      await db.user.update({
        where: { id: order.sellerId },
        data: { steamId: sellerSteamId },
      });
      await db.user.update({
        where: { id: order.buyerId },
        data: { steamId: buyerSteamId },
      });
      const original = {
        assetId: '10101',
        contextId: '2',
        appId: 730,
        classId: '101',
        instanceId: '0',
        marketHashName: 'test item',
        floatValue: null,
        paintSeed: null,
        stickers: [],
      };
      await db.tradeOperation.update({
        where: { id: op.id },
        data: {
          expectedAssetId: original.assetId,
          externalOfferId: '20202',
          tradeBinding: `p2pcs:${op.id}`,
          inventoryBaseline: {
            original,
            seller: { fetchedAt: new Date().toISOString(), assets: [original] },
            buyer: { fetchedAt: new Date().toISOString(), assets: [] },
          },
        },
      });
      const receipt = {
        status: 'accepted' as const,
        receiptVerified: true,
        bindingVerified: true,
        tradeId: '30303',
        tradable: null,
        tradeLockUntil: null,
      };
      const trades = app.get(TradesService);
      const spy = jest.spyOn(trades, 'verifyOffer').mockResolvedValue(receipt);
      const originalFlag = process.env.ENABLE_REAL_SETTLEMENT;
      process.env.ENABLE_REAL_SETTLEMENT = 'false';
      try {
        if (crashAfterProof) {
          await new DeliveryWorkflowService(db).verify(op.orderId, receipt);
          spy.mockResolvedValue({
            status: 'unknown',
            tradable: null,
            tradeLockUntil: null,
          });
        }
        const poller = app.get(TradeStatusPollerService);
        await poller.pollOrderById(op.orderId, { force: true });
        await poller.pollOrderById(op.orderId, { force: true });
        const saved = await db.tradeOperation.findUniqueOrThrow({
          where: { id: op.id },
        });
        const held = await db.order.findUniqueOrThrow({
          where: { id: op.orderId },
          include: { hold: true },
        });
        expect(held.status).toBe('SETTLEMENT_HOLD');
        expect(saved.deliveryProof).toMatchObject({
          version: 3,
          authority: 'STEAM_RECEIPT',
          tradeId: '30303',
        });
        expect(saved.deliveryProof).not.toHaveProperty('destinationAssetId');
        const proof = saved.deliveryProof as {
          protectionUntil: string;
          verifiedAt: string;
        };
        expect(held.hold!.settlementHoldUntil!.toISOString()).toBe(
          proof.protectionUntil,
        );
        expect(
          Date.parse(proof.protectionUntil) - Date.parse(proof.verifiedAt),
        ).toBeGreaterThanOrEqual(8 * 86400000);
        expect(
          await db.ledgerEntry.count({
            where: { orderId: op.orderId, type: 'SETTLEMENT_SELLER' },
          }),
        ).toBe(0);
        expect(
          await db.auditLog.count({
            where: { entityId: op.orderId, action: 'SETTLEMENT_HOLD_ENTERED' },
          }),
        ).toBe(1);
      } finally {
        spy.mockRestore();
        if (originalFlag === undefined)
          delete process.env.ENABLE_REAL_SETTLEMENT;
        else process.env.ENABLE_REAL_SETTLEMENT = originalFlag;
      }
    },
  );
});
