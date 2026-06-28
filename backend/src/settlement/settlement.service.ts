import { Injectable, NotFoundException } from '@nestjs/common';
import {
  InventoryAssetStatus,
  LotStatus,
  OrderStatus,
  Prisma,
  TradeOperationStatus,
} from '@prisma/client';
import { LotStateService } from '../lots/lot-state.service';
import { OrderStateService } from '../orders/order-state.service';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from '../wallet/ledger.service';
import { utcDayKey } from './settlement.config';
import { SettlementGuardService } from './settlement-guard.service';
import type { SettlementGuardResult } from './settlement.types';

type OrderForSettlement = {
  id: string;
  buyerId: string;
  sellerId: string;
  status: OrderStatus;
  amountMinor: bigint;
  lotId: string;
  buyer: { steamId: string | null };
  seller: { steamId: string | null };
  hold: { id: string; amountMinor: bigint };
  lot: {
    status: LotStatus;
    sellerReceiveMinor: bigint;
    commissionMinor: bigint;
    inventoryAssetId: string;
  };
  tradeOperation: { status: TradeOperationStatus } | null;
};

@Injectable()
export class SettlementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerService: LedgerService,
    private readonly lotStateService: LotStateService,
    private readonly orderStateService: OrderStateService,
    private readonly guard: SettlementGuardService,
  ) {}

  async evaluateOrder(orderId: string): Promise<SettlementGuardResult> {
    const order = await this.loadOrder(orderId);
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    return this.guard.canSettle(order);
  }

  async trySettleConfirmedOrder(
    orderId: string,
    idempotencyKey: string,
    tx?: Prisma.TransactionClient,
  ): Promise<{ settled: boolean; guard: SettlementGuardResult }> {
    const run = async (client: Prisma.TransactionClient) => {
      const order = await this.loadOrder(orderId, client);
      if (!order) {
        throw new NotFoundException('Order not found');
      }

      const guardResult = await this.guard.canSettle(order, client);
      if (!guardResult.allowed) {
        await this.emitSettlementBlocked(client, orderId, guardResult);
        return { settled: false, guard: guardResult };
      }

      if (order.status === OrderStatus.COMPLETED) {
        return { settled: true, guard: guardResult };
      }

      await this.settleCompletedOrder(client, order, idempotencyKey);
      return { settled: true, guard: guardResult };
    };

    if (tx) {
      return run(tx);
    }
    return this.prisma.$transaction(run);
  }

  async settleCompletedOrder(
    tx: Prisma.TransactionClient,
    order: OrderForSettlement,
    idempotencyKey: string,
    actorUserId?: string,
  ) {
    if (order.status === OrderStatus.COMPLETED) {
      return order;
    }

    await this.ledgerService.settleSale({
      buyerUserId: order.buyerId,
      sellerUserId: order.sellerId,
      orderId: order.id,
      holdId: order.hold.id,
      totalAmountMinor: order.hold.amountMinor,
      sellerReceiveMinor: order.lot.sellerReceiveMinor,
      commissionMinor: order.lot.commissionMinor,
      idempotencyKey,
      tx,
    });

    await tx.hold.update({
      where: { id: order.hold.id },
      data: { capturedMinor: order.hold.amountMinor },
    });

    await this.orderStateService.transition(tx, {
      orderId: order.id,
      from: OrderStatus.TRADE_CONFIRMED,
      to: OrderStatus.COMPLETED,
      actorUserId,
      reason: 'REAL_SETTLEMENT',
    });

    await this.lotStateService.transition(tx, {
      lotId: order.lotId,
      from: order.lot.status,
      to: LotStatus.SOLD,
      actorUserId,
    });

    await tx.inventoryAsset.update({
      where: { id: order.lot.inventoryAssetId },
      data: { status: InventoryAssetStatus.SOLD },
    });

    await this.incrementDailyStats(tx, order.id, order.amountMinor);

    await tx.outboxEvent.create({
      data: {
        eventType: 'ORDER_COMPLETED',
        aggregateType: 'order',
        aggregateId: order.id,
        payload: { orderId: order.id },
      },
    });
    await tx.outboxEvent.create({
      data: {
        eventType: 'SALE_SETTLED',
        aggregateType: 'order',
        aggregateId: order.id,
        payload: { orderId: order.id },
      },
    });

    return order;
  }

  private async emitSettlementBlocked(
    tx: Prisma.TransactionClient,
    orderId: string,
    guard: Extract<SettlementGuardResult, { allowed: false }>,
  ) {
    const existing = await tx.outboxEvent.findFirst({
      where: {
        eventType: 'SETTLEMENT_BLOCKED',
        aggregateType: 'order',
        aggregateId: orderId,
      },
    });
    if (existing) {
      return;
    }

    await tx.outboxEvent.create({
      data: {
        eventType: 'SETTLEMENT_BLOCKED',
        aggregateType: 'order',
        aggregateId: orderId,
        payload: {
          orderId,
          code: guard.code,
          reason: guard.reason,
        },
      },
    });
  }

  private async incrementDailyStats(
    tx: Prisma.TransactionClient,
    _orderId: string,
    amountMinor: bigint,
  ) {
    const day = utcDayKey();
    await tx.settlementDailyStats.upsert({
      where: { day },
      create: {
        day,
        orderCount: 1,
        volumeMinor: amountMinor,
      },
      update: {
        orderCount: { increment: 1 },
        volumeMinor: { increment: amountMinor },
      },
    });
  }

  private async loadOrder(
    orderId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<OrderForSettlement | null> {
    const db = tx ?? this.prisma;
    return db.order.findUnique({
      where: { id: orderId },
      include: {
        buyer: { select: { steamId: true } },
        seller: { select: { steamId: true } },
        hold: true,
        lot: true,
        tradeOperation: true,
      },
    }) as Promise<OrderForSettlement | null>;
  }
}
