import { INestApplication } from '@nestjs/common';
import { OrderStatus, TradeOperationStatus, UserRole } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from '../src/prisma/prisma.service';
import { ApiClient } from './helpers/api-client';
import { createE2eApp } from './helpers/bootstrap-e2e-app';
import { resetDatabase } from './helpers/reset-database';
import { SettlementService } from '../src/settlement/settlement.service';
import { LedgerService } from '../src/wallet/ledger.service';
import { AdminService } from '../src/admin/admin.service';
import { DisputeResolution } from '../src/admin/dto/resolve-dispute.dto';
import { SteamTradeProvider } from '../src/providers/trade/steam-trade.provider';

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
    jest
      .spyOn(SteamTradeProvider.prototype, 'verifyTradeReceipt')
      .mockResolvedValue({
        status: 'unknown',
        reasonCode: 'STEAM_RECEIPT_UNAVAILABLE',
        tradable: null,
        tradeLockUntil: null,
      });
    jest
      .spyOn(SteamTradeProvider.prototype, 'verifyTradeOffer')
      .mockResolvedValue({
        status: 'unknown',
        tradable: null,
        tradeLockUntil: null,
      });
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
    jest.restoreAllMocks();
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

  it('keeps a legacy confirmed order without durable proof unpaid', async () => {
    const { orderId } = await createOrderWithSteamIds();
    await markTradeConfirmed(orderId);
    const admin = await api.login(UserRole.ADMIN);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/admin/orders/${orderId}/retry-settlement`)
      .set('Authorization', `Bearer ${admin.token}`)
      .set('Idempotency-Key', 'settle-retry-1')
      .send({})
      .expect(201);

    expect(response.body.order.status).toBe('TRADE_CONFIRMED');

    const settlement = await prisma.ledgerEntry.findFirst({
      where: { orderId, type: 'SETTLEMENT_SELLER' },
    });
    expect(settlement).toBeNull();
  });

  describe('proof-window database serialization', () => {
    const config = { ...process.env };
    beforeEach(() => {
      process.env.SETTLEMENT_RELEASE_POLICY = 'proof_window';
      process.env.SETTLEMENT_ROLLOUT_MODE = 'open';
      process.env.AUTO_SETTLEMENT_MAX_ORDER_MINOR = '10000';
      process.env.AUTO_SETTLEMENT_MAX_EXPOSURE_MINOR = '10000';
    });
    afterEach(() => {
      for (const key of [
        'SETTLEMENT_RELEASE_POLICY',
        'SETTLEMENT_ROLLOUT_MODE',
        'AUTO_SETTLEMENT_MAX_ORDER_MINOR',
        'AUTO_SETTLEMENT_MAX_EXPOSURE_MINOR',
      ]) {
        if (config[key] === undefined) delete process.env[key];
        else process.env[key] = config[key];
      }
    });
    async function heldOrder(deadline?: string) {
      const { orderId } = await createOrderWithSteamIds();
      const until = deadline ?? new Date(Date.now() - 1000).toISOString();
      await prisma.tradeOperation.update({
        where: { orderId },
        data: {
          status: TradeOperationStatus.DELIVERY_VERIFIED,
          verificationStage: 'PROTECTION',
          externalOfferId: '123456',
          expectedAssetId: '789',
          tradeBinding: `p2pcs:${orderId}`,
          deliveryProof: {
            version: 3,
            authority: 'STEAM_RECEIPT',
            orderId,
            offerId: '123456',
            tradeId: '987654',
            originalAssetId: '789',
            sellerSteamId,
            buyerSteamId,
            bindingVerified: true,
            tradeBinding: `p2pcs:${orderId}`,
            receiptStatus: 3,
            offerState: 3,
            verifiedAt: new Date(
              Date.parse(until) - 8 * 86400000,
            ).toISOString(),
            protectionUntil: until,
          },
        },
      });
      await prisma.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.SETTLEMENT_HOLD },
      });
      await prisma.hold.update({
        where: { orderId },
        data: {
          settlementHoldUntil: new Date(Date.parse(until) - 3 * 3600000),
        },
      });
      return orderId;
    }
    async function exactlyOnce(orderId: string) {
      expect(
        await prisma.ledgerEntry.count({
          where: { orderId, type: 'SETTLEMENT_SELLER' },
        }),
      ).toBe(1);
      expect(
        await prisma.ledgerEntry.count({
          where: { orderId, type: 'SETTLEMENT_PLATFORM_COMMISSION' },
        }),
      ).toBe(1);
      expect(
        await prisma.ledgerEntry.count({
          where: {
            orderId,
            idempotencyKey: `settlement-release:${orderId}`,
            type: 'HOLD_RESERVE',
          },
        }),
      ).toBe(1);
      const held = await prisma.hold.findUniqueOrThrow({ where: { orderId } });
      expect(held.capturedMinor).toBe(held.amountMinor);
      expect(held.releasedMinor).toBe(0n);
      expect(held.settlementReleasedAt).not.toBeNull();
      expect(
        (await prisma.order.findUniqueOrThrow({ where: { id: orderId } }))
          .status,
      ).toBe(OrderStatus.COMPLETED);
    }

    it.each(['UTC', 'Europe/Moscow'])(
      'honors the exact proof instant in PostgreSQL session %s despite an early cache',
      async (timezone) => {
        const deadline = Date.now() + 3600000;
        const id = await heldOrder(new Date(deadline).toISOString());
        const service = app.get(SettlementService);
        const clock = jest.spyOn(Date, 'now').mockReturnValue(deadline - 1);
        try {
          const early = await prisma.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT set_config('TimeZone', ${timezone}, true)`;
            return service.trySettleConfirmedOrder(id, 'before-deadline', tx);
          });
          expect(early.settled).toBe(false);
          expect(
            await prisma.ledgerEntry.count({
              where: { orderId: id, type: 'SETTLEMENT_SELLER' },
            }),
          ).toBe(0);
          clock.mockReturnValue(deadline);
          await prisma.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT set_config('TimeZone', ${timezone}, true)`;
            return service.trySettleConfirmedOrder(id, 'at-deadline', tx);
          });
          await exactlyOnce(id);
        } finally {
          clock.mockRestore();
        }
      },
    );
    it('serializes two workers and a manual retry, then a restart-style retry', async () => {
      const id = await heldOrder();
      const service = app.get(SettlementService);
      await Promise.all([
        service.releaseDueSettlementHold(id, 'worker-a'),
        service.releaseDueSettlementHold(id, 'worker-b'),
        service.trySettleConfirmedOrder(id, 'manual'),
      ]);
      await service.releaseDueSettlementHold(id, 'restart');
      await exactlyOnce(id);
    });
    it('rolls back ledger writes on failure before commit, then retries once', async () => {
      const id = await heldOrder();
      const ledger = app.get(LedgerService);
      const real = ledger.settleSale.bind(ledger);
      const fault = jest
        .spyOn(ledger, 'settleSale')
        .mockImplementationOnce(async (args) => {
          await real(args);
          throw new Error('simulated process failure before commit');
        });
      try {
        await expect(
          app.get(SettlementService).releaseDueSettlementHold(id, 'crash'),
        ).rejects.toThrow('simulated process failure');
      } finally {
        fault.mockRestore();
      }
      expect(
        await prisma.ledgerEntry.count({
          where: { orderId: id, type: 'SETTLEMENT_SELLER' },
        }),
      ).toBe(0);
      await app.get(SettlementService).releaseDueSettlementHold(id, 'retry');
      await exactlyOnce(id);
    });
    it('explicit seller adjudication releases only this order mapping leases', async () => {
      const id = await heldOrder();
      const admin = await api.login(UserRole.ADMIN);
      await prisma.order.update({
        where: { id },
        data: { status: OrderStatus.DISPUTE },
      });
      await prisma.steamMappingLease.createMany({
        data: [
          {
            steamId: sellerSteamId,
            orderId: id,
            leaseUntil: new Date(Date.now() + 60000),
          },
          {
            steamId: outsiderSteamId,
            orderId: 'unrelated-order',
            leaseUntil: new Date(Date.now() + 60000),
          },
        ],
      });
      await app
        .get(AdminService)
        .resolveDispute(
          id,
          admin.userId,
          DisputeResolution.SELLER,
          { reasonCode: 'ADMIN_RESOLVE_SELLER' },
          'explicit-resolution',
        );
      expect(
        await prisma.steamMappingLease.count({ where: { orderId: id } }),
      ).toBe(0);
      expect(
        await prisma.steamMappingLease.count({
          where: { orderId: 'unrelated-order' },
        }),
      ).toBe(1);
      expect(
        await prisma.auditLog.count({
          where: {
            entityId: id,
            action: 'ADMIN_ADJUDICATION_MAPPING_LEASE_RELEASED',
          },
        }),
      ).toBe(1);
    });
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
