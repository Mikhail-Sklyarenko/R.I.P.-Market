import type { INestApplication } from '@nestjs/common';
import { OrderStatus, Prisma, TradeOperationStatus } from '@prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';
import { OrderStateService } from '../../src/orders/order-state.service';
import { SettlementService } from '../../src/settlement/settlement.service';
import { getSteamProtectionMs } from '../../src/settlement/settlement-hold.config';

function requireTestDatabase(): void {
  const database = new URL(process.env.DATABASE_URL ?? 'http://invalid');
  if (
    !['localhost', '127.0.0.1'].includes(database.hostname) ||
    database.pathname !== '/p2pcs_e2e'
  ) {
    throw new Error(
      'Proof fixtures require the local disposable p2pcs_e2e database',
    );
  }
}

/** Isolated test policy, restored even when an assertion or transaction fails. */
export async function withProofSettlementPolicy<T>(
  amount: number,
  run: () => Promise<T>,
): Promise<T> {
  requireTestDatabase();
  const values: Record<string, string> = {
    ENABLE_REAL_SETTLEMENT: 'true',
    TRADE_VERIFICATION_MODE: 'live',
    SETTLEMENT_RELEASE_POLICY: 'proof_window',
    SETTLEMENT_ROLLOUT_MODE: 'open',
    AUTO_SETTLEMENT_MAX_ORDER_MINOR: String(amount),
    AUTO_SETTLEMENT_MAX_EXPOSURE_MINOR: String(amount),
    STEAM_SETTLEMENT_MAX_ORDER_MINOR: String(amount),
    STEAM_SETTLEMENT_MAX_DAILY_ORDERS: '10',
    STEAM_SETTLEMENT_MAX_DAILY_VOLUME_MINOR: String(amount * 10),
  };
  const before = Object.fromEntries(
    Object.keys(values).map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, values);
  try {
    return await run();
  } finally {
    for (const key of Object.keys(values)) {
      if (before[key] === undefined) delete process.env[key];
      else process.env[key] = before[key];
    }
  }
}

/** Test-only receipt setup, never overwrites an existing proof or credits a wallet. */
export async function prepareProofBackedHold(
  app: INestApplication,
  orderId: string,
  deadline = new Date(Date.now() - 1000).toISOString(),
) {
  requireTestDatabase();
  const prisma = app.get(PrismaService);
  const proof = await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: {
        buyer: true,
        seller: true,
        tradeOperation: true,
        lot: { include: { inventoryAsset: true } },
      },
    });
    const operation = order.tradeOperation;
    if (!operation || operation.deliveryProof !== null)
      throw new Error('Fixture refuses to overwrite delivery proof');
    if (
      order.status !== OrderStatus.WAITING_TRADE &&
      order.status !== OrderStatus.TRADE_CONFIRMED
    )
      throw new Error('Fixture requires an uncompleted trade');
    const sellerSteamId = order.seller.steamId ?? '76561198000000002';
    const buyerSteamId = order.buyer.steamId ?? '76561198000000001';
    await tx.user.update({
      where: { id: order.sellerId },
      data: { steamId: sellerSteamId },
    });
    await tx.user.update({
      where: { id: order.buyerId },
      data: { steamId: buyerSteamId },
    });
    const numericId = BigInt(
      `0x${orderId.replaceAll('-', '').slice(0, 12)}`,
    ).toString();
    const currentAsset = order.lot.inventoryAsset.assetExternalId;
    const originalAssetId = /^[1-9][0-9]*$/.test(currentAsset)
      ? currentAsset
      : numericId;
    if (currentAsset !== originalAssetId)
      await tx.inventoryAsset.update({
        where: { id: order.lot.inventoryAssetId },
        data: { assetExternalId: originalAssetId },
      });
    const offerId = operation.externalOfferId ?? `${numericId}1`;
    const tradeBinding = operation.tradeBinding ?? `p2pcs:${orderId}`;
    const receipt = {
      version: 3,
      authority: 'STEAM_RECEIPT',
      orderId,
      offerId,
      tradeId: `${numericId}2`,
      originalAssetId,
      sellerSteamId,
      buyerSteamId,
      bindingVerified: true,
      tradeBinding,
      receiptStatus: 3,
      offerState: 3,
      verifiedAt: new Date(
        Date.parse(deadline) - getSteamProtectionMs(),
      ).toISOString(),
      protectionUntil: deadline,
    };
    const saved = await tx.tradeOperation.updateMany({
      where: { id: operation.id, deliveryProof: { equals: Prisma.DbNull } },
      data: {
        externalOfferId: offerId,
        expectedAssetId: originalAssetId,
        tradeBinding,
        deliveryProof: receipt,
        status: TradeOperationStatus.DELIVERY_VERIFIED,
        verificationStage: 'PROTECTION',
      },
    });
    if (saved.count !== 1)
      throw new Error('Fixture proof compare-and-set failed');
    if (order.status === OrderStatus.WAITING_TRADE)
      await app.get(OrderStateService).transitionByEvent(tx, {
        orderId,
        from: OrderStatus.WAITING_TRADE,
        event: 'DELIVERY_VERIFIED',
        reason: 'E2E_RECEIPT_FIXTURE',
      });
    return receipt;
  });
  const held = await app
    .get(SettlementService)
    .trySettleConfirmedOrder(orderId, `e2e-hold:${orderId}`);
  if (!held.inHold || held.settled)
    throw new Error(
      `Fixture did not enter settlement hold: ${JSON.stringify(held)}`,
    );
  return proof;
}

export async function expectExactlyOneSettlement(
  prisma: PrismaService,
  orderId: string,
): Promise<void> {
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { hold: true, lot: true },
  });
  expect(order.status).toBe(OrderStatus.COMPLETED);
  if (!order.hold) throw new Error('Completed order must retain its hold');
  expect(order.hold.capturedMinor).toBe(order.amountMinor);
  expect(order.hold.releasedMinor).toBe(0n);
  expect(order.hold.settlementReleasedAt).not.toBeNull();
  const seller = await prisma.ledgerEntry.findMany({
    where: { orderId, type: 'SETTLEMENT_SELLER' },
  });
  const fees = await prisma.ledgerEntry.findMany({
    where: { orderId, type: 'SETTLEMENT_PLATFORM_COMMISSION' },
  });
  expect(seller).toHaveLength(1);
  expect(fees).toHaveLength(1);
  expect(seller[0].amountMinor).toBe(order.lot.sellerReceiveMinor);
  expect(fees[0].amountMinor).toBe(order.lot.commissionMinor);
  expect(
    await prisma.ledgerEntry.count({
      where: {
        orderId,
        type: 'HOLD_RESERVE',
        idempotencyKey: `settlement-release:${orderId}`,
      },
    }),
  ).toBe(1);
}
