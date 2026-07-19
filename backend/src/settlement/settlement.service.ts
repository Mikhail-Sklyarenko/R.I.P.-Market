import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  InventoryAssetStatus,
  LotStatus,
  OrderStatus,
  Prisma,
  TradeOperationStatus,
} from '@prisma/client';
import { getAuditContext } from '../common/observability/audit-context';
import { LotStateService } from '../lots/lot-state.service';
import { OrderStateService } from '../orders/order-state.service';
import { PrismaService } from '../prisma/prisma.service';
import { isExtensionFirstTradeFlowEnabled } from '../trades/extension-trade-flow.config';
import { LedgerService } from '../wallet/ledger.service';
import { isRealSettlementEnabled, utcDayKey } from './settlement.config';
import {
  getSettlementHoldMs,
  isSettlementHoldWindowEnabled,
  settlementHoldEnterIdempotencyKey,
  settlementHoldReleaseIdempotencyKey,
  settlementHoldReverseIdempotencyKey,
} from './settlement-hold.config';
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
  hold: {
    id: string;
    amountMinor: bigint;
    capturedMinor: bigint;
    releasedMinor: bigint;
    settlementHoldUntil: Date | null;
    settlementReleasedAt: Date | null;
  };
  lot: {
    status: LotStatus;
    sellerReceiveMinor: bigint;
    commissionMinor: bigint;
    inventoryAssetId: string;
  };
  tradeOperation: { status: TradeOperationStatus } | null;
};

export type SettlementAttemptResult = {
  settled: boolean;
  inHold: boolean;
  guard: SettlementGuardResult;
};

@Injectable()
export class SettlementService {
  private readonly logger = new Logger(SettlementService.name);

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
  ): Promise<SettlementAttemptResult> {
    const run = async (client: Prisma.TransactionClient) => {
      const order = await this.loadOrder(orderId, client);
      if (!order) {
        throw new NotFoundException('Order not found');
      }

      const guardResult = await this.guard.canSettle(order, client);
      if (!guardResult.allowed) {
        await this.emitSettlementBlocked(client, orderId, guardResult);
        return { settled: false, inHold: false, guard: guardResult };
      }

      if (order.status === OrderStatus.COMPLETED) {
        return { settled: true, inHold: false, guard: guardResult };
      }

      if (this.shouldUseHoldWindow()) {
        if (order.status === OrderStatus.TRADE_CONFIRMED) {
          await this.enterSettlementHold(client, order, idempotencyKey);
          return { settled: false, inHold: true, guard: guardResult };
        }
        if (
          order.status === OrderStatus.SETTLEMENT_HOLD &&
          this.isHoldReleaseDue(order.hold)
        ) {
          await this.releaseSettlementHold(client, order, idempotencyKey);
          return { settled: true, inHold: false, guard: guardResult };
        }
        if (order.status === OrderStatus.SETTLEMENT_HOLD) {
          return { settled: false, inHold: true, guard: guardResult };
        }
      }

      await this.settleCompletedOrder(client, order, idempotencyKey);
      return { settled: true, inHold: false, guard: guardResult };
    };

    if (tx) {
      return run(tx);
    }
    return this.prisma.$transaction(run);
  }

  async releaseDueSettlementHold(
    orderId: string,
    idempotencyKey = settlementHoldReleaseIdempotencyKey(orderId),
  ): Promise<SettlementAttemptResult> {
    return this.prisma.$transaction(async (tx) => {
      const order = await this.loadOrder(orderId, tx);
      if (!order) {
        throw new NotFoundException('Order not found');
      }

      if (order.status === OrderStatus.COMPLETED) {
        return {
          settled: true,
          inHold: false,
          guard: { allowed: true },
        };
      }

      if (order.status !== OrderStatus.SETTLEMENT_HOLD) {
        return {
          settled: false,
          inHold: false,
          guard: {
            allowed: false,
            code: 'ORDER_NOT_TRADE_CONFIRMED',
            reason: `Order status is ${order.status}, expected SETTLEMENT_HOLD`,
          },
        };
      }

      // Hold window is only for real settlement. If real settlement is off,
      // immediately credit the seller (recovers orders stuck by misconfig).
      if (!isRealSettlementEnabled()) {
        await this.releaseSettlementHold(tx, order, idempotencyKey, undefined, {
          skipHoldWindowCheck: true,
          legacyImmediate: true,
        });
        return {
          settled: true,
          inHold: false,
          guard: { allowed: true },
        };
      }

      if (!this.isHoldReleaseDue(order.hold)) {
        return {
          settled: false,
          inHold: true,
          guard: { allowed: true },
        };
      }

      const guardResult = await this.guard.canSettle(order, tx);
      if (!guardResult.allowed) {
        await this.emitSettlementBlocked(tx, orderId, guardResult);
        return { settled: false, inHold: true, guard: guardResult };
      }

      await this.releaseSettlementHold(tx, order, idempotencyKey);
      return { settled: true, inHold: false, guard: guardResult };
    });
  }

  async reverseSettlementHold(
    orderId: string,
    reasonCode: string,
    idempotencyKey = settlementHoldReverseIdempotencyKey(orderId),
    actorUserId?: string,
  ) {
    const existingAudit = await this.prisma.auditLog.findFirst({
      where: {
        entityType: 'order',
        entityId: orderId,
        action: 'SETTLEMENT_HOLD_REVERSED',
        idempotencyKey,
      },
    });
    if (existingAudit) {
      return this.loadOrder(orderId);
    }

    return this.prisma.$transaction(async (tx) => {
      const order = await this.loadOrder(orderId, tx);
      if (!order) {
        throw new NotFoundException('Order not found');
      }
      if (order.status !== OrderStatus.SETTLEMENT_HOLD) {
        throw new NotFoundException('Order is not in settlement hold');
      }
      if (order.hold.capturedMinor > 0n || order.hold.settlementReleasedAt) {
        throw new NotFoundException('Settlement hold was already released');
      }

      const refundAmount = order.hold.amountMinor - order.hold.releasedMinor;
      if (refundAmount > 0n) {
        await this.ledgerService.refundHold({
          buyerUserId: order.buyerId,
          orderId: order.id,
          holdId: order.hold.id,
          amountMinor: refundAmount,
          idempotencyKey,
          tx,
        });
      }

      await tx.hold.update({
        where: { id: order.hold.id },
        data: { releasedMinor: order.hold.amountMinor },
      });

      await this.orderStateService.transitionByEvent(tx, {
        orderId: order.id,
        from: OrderStatus.SETTLEMENT_HOLD,
        event: 'SETTLEMENT_REVERSED',
        actorUserId,
        reason: reasonCode,
      });

      await this.lotStateService.transition(tx, {
        lotId: order.lotId,
        from: order.lot.status,
        to: LotStatus.BLOCKED,
        actorUserId,
      });

      await tx.inventoryAsset.update({
        where: { id: order.lot.inventoryAssetId },
        data: { status: InventoryAssetStatus.BLOCKED },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: actorUserId ?? null,
          entityType: 'order',
          entityId: order.id,
          action: 'SETTLEMENT_HOLD_REVERSED',
          reason: reasonCode,
          beforeState: {
            status: OrderStatus.SETTLEMENT_HOLD,
            holdAmountMinor: order.hold.amountMinor.toString(),
          },
          afterState: {
            status: OrderStatus.DISPUTE,
            refundedMinor: refundAmount.toString(),
          },
          idempotencyKey,
          ...getAuditContext(),
        },
      });

      await tx.outboxEvent.create({
        data: {
          eventType: 'SETTLEMENT_HOLD_REVERSED',
          aggregateType: 'order',
          aggregateId: order.id,
          payload: { orderId: order.id, reasonCode },
        },
      });

      this.logger.warn(
        JSON.stringify({
          event: 'settlement_hold_reversed',
          metric: 'settlement_hold_reversed_total',
          alert: true,
          orderId: order.id,
          reasonCode,
        }),
      );

      return this.loadOrder(orderId, tx);
    });
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

    if (this.shouldUseHoldWindow()) {
      if (order.status === OrderStatus.TRADE_CONFIRMED) {
        return this.enterSettlementHold(tx, order, idempotencyKey, actorUserId);
      }
      if (order.status === OrderStatus.SETTLEMENT_HOLD) {
        return this.releaseSettlementHold(
          tx,
          order,
          settlementHoldReleaseIdempotencyKey(order.id),
          actorUserId,
        );
      }
    }

    return this.releaseSettlementHold(tx, order, idempotencyKey, actorUserId, {
      skipHoldWindowCheck: true,
      legacyImmediate: true,
    });
  }

  private async enterSettlementHold(
    tx: Prisma.TransactionClient,
    order: OrderForSettlement,
    idempotencyKey: string,
    actorUserId?: string,
  ) {
    const enterKey = settlementHoldEnterIdempotencyKey(order.id);
    const existingAudit = await tx.auditLog.findFirst({
      where: {
        entityType: 'order',
        entityId: order.id,
        action: 'SETTLEMENT_HOLD_ENTERED',
        idempotencyKey: enterKey,
      },
    });
    if (existingAudit) {
      return order;
    }

    const holdUntil = new Date(Date.now() + getSettlementHoldMs());
    const deliveryVerified = this.isDeliveryVerified(order);

    await this.orderStateService.transitionByEvent(tx, {
      orderId: order.id,
      from: OrderStatus.TRADE_CONFIRMED,
      event: 'SETTLEMENT_STARTED',
      actorUserId,
      reason: 'SETTLEMENT_HOLD_WINDOW',
      guards: { deliveryVerified },
    });

    await tx.hold.update({
      where: { id: order.hold.id },
      data: { settlementHoldUntil: holdUntil },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: actorUserId ?? null,
        entityType: 'order',
        entityId: order.id,
        action: 'SETTLEMENT_HOLD_ENTERED',
        beforeState: {
          status: OrderStatus.TRADE_CONFIRMED,
          capturedMinor: order.hold.capturedMinor.toString(),
        },
        afterState: {
          status: OrderStatus.SETTLEMENT_HOLD,
          settlementHoldUntil: holdUntil.toISOString(),
          triggerIdempotencyKey: idempotencyKey,
        },
        idempotencyKey: enterKey,
        ...getAuditContext(),
      },
    });

    await tx.outboxEvent.create({
      data: {
        eventType: 'SETTLEMENT_HOLD_STARTED',
        aggregateType: 'order',
        aggregateId: order.id,
        payload: {
          orderId: order.id,
          settlementHoldUntil: holdUntil.toISOString(),
        },
      },
    });

    this.logger.log(
      JSON.stringify({
        event: 'settlement_hold_entered',
        orderId: order.id,
        settlementHoldUntil: holdUntil.toISOString(),
      }),
    );

    return order;
  }

  private async releaseSettlementHold(
    tx: Prisma.TransactionClient,
    order: OrderForSettlement,
    idempotencyKey: string,
    actorUserId?: string,
    options?: { skipHoldWindowCheck?: boolean; legacyImmediate?: boolean },
  ) {
    if (order.status === OrderStatus.COMPLETED) {
      return order;
    }

    if (
      this.shouldUseHoldWindow() &&
      !options?.skipHoldWindowCheck &&
      !this.isHoldReleaseDue(order.hold)
    ) {
      return order;
    }

    const releaseAuditKey = settlementHoldReleaseIdempotencyKey(order.id);
    const existingReleaseAudit = await tx.auditLog.findFirst({
      where: {
        entityType: 'order',
        entityId: order.id,
        action: 'SETTLEMENT_HOLD_RELEASED',
        idempotencyKey: releaseAuditKey,
      },
    });
    if (existingReleaseAudit || order.hold.settlementReleasedAt) {
      return order;
    }

    if (order.hold.capturedMinor > 0n) {
      return order;
    }

    const deliveryVerified = this.isDeliveryVerified(order);

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

    const releasedAt = new Date();
    await tx.hold.update({
      where: { id: order.hold.id },
      data: {
        capturedMinor: order.hold.amountMinor,
        settlementReleasedAt: releasedAt,
      },
    });

    if (this.shouldUseHoldWindow() && !options?.legacyImmediate) {
      await this.orderStateService.transitionByEvent(tx, {
        orderId: order.id,
        from: OrderStatus.SETTLEMENT_HOLD,
        event: 'SETTLEMENT_RELEASED',
        actorUserId,
        reason: 'SETTLEMENT_HOLD_RELEASED',
        guards: { deliveryVerified },
      });
    } else if (isExtensionFirstTradeFlowEnabled()) {
      await this.orderStateService.transitionByEvent(tx, {
        orderId: order.id,
        from: order.status,
        event: 'SETTLEMENT_STARTED',
        actorUserId,
        reason: 'REAL_SETTLEMENT_START',
        guards: { deliveryVerified },
      });
      await this.orderStateService.transitionByEvent(tx, {
        orderId: order.id,
        from: OrderStatus.SETTLEMENT_HOLD,
        event: 'SETTLEMENT_RELEASED',
        actorUserId,
        reason: 'REAL_SETTLEMENT_RELEASED',
        guards: { deliveryVerified },
      });
    } else {
      await this.orderStateService.transitionByEvent(tx, {
        orderId: order.id,
        from: OrderStatus.TRADE_CONFIRMED,
        event: 'LEGACY_SETTLED',
        actorUserId,
        reason: 'REAL_SETTLEMENT',
      });
    }

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

    await tx.auditLog.create({
      data: {
        actorUserId: actorUserId ?? null,
        entityType: 'order',
        entityId: order.id,
        action: 'SETTLEMENT_HOLD_RELEASED',
        beforeState: {
          status: order.status,
          capturedMinor: '0',
        },
        afterState: {
          status: OrderStatus.COMPLETED,
          capturedMinor: order.hold.amountMinor.toString(),
          settlementReleasedAt: releasedAt.toISOString(),
          ledgerIdempotencyKey: idempotencyKey,
        },
        idempotencyKey: releaseAuditKey,
        ...getAuditContext(),
      },
    });

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

    this.logger.log(
      JSON.stringify({
        event: 'settlement_hold_released',
        metric: 'settlement_hold_released_total',
        orderId: order.id,
        amountMinor: order.hold.amountMinor.toString(),
      }),
    );

    return order;
  }

  private shouldUseHoldWindow(): boolean {
    // 8-day hold is a real-money protection. Never delay seller payouts when
    // ENABLE_REAL_SETTLEMENT is off (staging/mock) — that stranded sellers.
    return (
      isRealSettlementEnabled() &&
      isSettlementHoldWindowEnabled() &&
      isExtensionFirstTradeFlowEnabled()
    );
  }

  private isHoldReleaseDue(hold: {
    settlementHoldUntil: Date | null;
    settlementReleasedAt: Date | null;
  }): boolean {
    if (hold.settlementReleasedAt) {
      return false;
    }
    if (!hold.settlementHoldUntil) {
      return false;
    }
    return hold.settlementHoldUntil.getTime() <= Date.now();
  }

  private isDeliveryVerified(order: OrderForSettlement): boolean {
    return (
      order.tradeOperation?.status === TradeOperationStatus.DELIVERY_VERIFIED ||
      order.tradeOperation?.status === TradeOperationStatus.CONFIRMED
    );
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
