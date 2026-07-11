import { HttpStatus, Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import {
  InventoryAssetStatus,
  LotStatus,
  OrderStatus,
  Prisma,
  TradeOperationStatus,
} from '@prisma/client';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { getAuditContext } from '../common/observability/audit-context';
import { LotStateService } from '../lots/lot-state.service';
import { OrderStateService } from '../orders/order-state.service';
import { PrismaService } from '../prisma/prisma.service';
import { isTradeReferenceReconcileEnabled } from './trade-reference.config';
import {
  isValidSteamOfferId,
  normalizeTradeReferenceInput,
} from './trade-reference.util';
import { TradeStatusPollerService } from './trade-status-poller.service';

export type TradeReferenceSource = 'MANUAL' | 'EXTENSION';

type DisputeOrderContext = {
  id: string;
  lotId: string;
  status: OrderStatus;
  tradeOperation: { id: string; externalOfferId?: string | null };
  lot: { status: LotStatus; inventoryAssetId: string };
};

export type TradeReferenceReconcileResult = {
  orderId: string;
  externalOfferId: string;
  applied: boolean;
  idempotent: boolean;
  disputed: boolean;
};

@Injectable()
export class TradeReferenceReconcileService {
  private readonly logger = new Logger(TradeReferenceReconcileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orderStateService: OrderStateService,
    private readonly lotStateService: LotStateService,
    @Inject(forwardRef(() => TradeStatusPollerService))
    private readonly tradeStatusPoller: TradeStatusPollerService,
  ) {}

  async reconcile(params: {
    orderId: string;
    sellerId: string;
    offerId?: string | null;
    tradeUrl?: string | null;
    idempotencyKey?: string | null;
    source: TradeReferenceSource;
    actorUserId?: string | null;
  }): Promise<TradeReferenceReconcileResult> {
    const offerId = normalizeTradeReferenceInput({
      offerId: params.offerId,
      tradeUrl: params.tradeUrl,
    });
    if (!offerId || !isValidSteamOfferId(offerId)) {
      throw new AppException(
        ErrorCode.VALIDATION_ERROR,
        'offerId or valid Steam trade offer URL is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    const idempotencyKey =
      params.idempotencyKey ??
      `trade-ref:${params.source}:${params.orderId}:${offerId}`;

    const existingAudit = await this.prisma.auditLog.findFirst({
      where: {
        entityType: 'order',
        entityId: params.orderId,
        action: 'TRADE_REFERENCE_RECONCILED',
        idempotencyKey,
      },
    });
    if (existingAudit) {
      return {
        orderId: params.orderId,
        externalOfferId: offerId,
        applied: false,
        idempotent: true,
        disputed: false,
      };
    }

    const order = await this.prisma.order.findUnique({
      where: { id: params.orderId },
      include: {
        tradeOperation: true,
        lot: true,
      },
    });

    if (!order || order.sellerId !== params.sellerId) {
      throw new AppException(
        ErrorCode.ORDER_NOT_FOUND,
        'Order not found',
        HttpStatus.NOT_FOUND,
      );
    }
    if (!order.tradeOperation) {
      throw new AppException(
        ErrorCode.NOT_FOUND,
        'Trade operation not found',
        HttpStatus.NOT_FOUND,
      );
    }
    if (order.status !== OrderStatus.WAITING_TRADE) {
      throw new AppException(
        ErrorCode.BAD_REQUEST,
        'Trade reference can only be updated while waiting for trade',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (order.tradeOperation.externalOfferId === offerId) {
      await this.recordAudit({
        orderId: order.id,
        actorUserId: params.actorUserId ?? params.sellerId,
        idempotencyKey,
        beforeState: { externalOfferId: offerId },
        afterState: { externalOfferId: offerId, idempotent: true },
        source: params.source,
      });
      return {
        orderId: order.id,
        externalOfferId: offerId,
        applied: false,
        idempotent: true,
        disputed: false,
      };
    }

    const strict = isTradeReferenceReconcileEnabled();
    if (strict) {
      const spoofed = await this.findSpoofedOrder(offerId, order.id);
      if (spoofed) {
        await this.openDisputeForReferenceIssue({
          order: order as DisputeOrderContext,
          actorUserId: params.actorUserId ?? params.sellerId,
          idempotencyKey,
          reasonCode: 'TRADE_REFERENCE_SPOOF',
          details: {
            offerId,
            conflictingOrderId: spoofed.orderId,
          },
          source: params.source,
        });
        return {
          orderId: order.id,
          externalOfferId: offerId,
          applied: false,
          idempotent: false,
          disputed: true,
        };
      }

      if (
        order.tradeOperation.externalOfferId &&
        order.tradeOperation.externalOfferId !== offerId
      ) {
        await this.openDisputeForReferenceIssue({
          order: order as DisputeOrderContext,
          actorUserId: params.actorUserId ?? params.sellerId,
          idempotencyKey,
          reasonCode: 'TRADE_REFERENCE_MISMATCH',
          details: {
            previousOfferId: order.tradeOperation.externalOfferId,
            incomingOfferId: offerId,
          },
          source: params.source,
        });
        return {
          orderId: order.id,
          externalOfferId: offerId,
          applied: false,
          idempotent: false,
          disputed: true,
        };
      }
    }

    const beforeOfferId = order.tradeOperation.externalOfferId;
    try {
      await this.prisma.tradeOperation.update({
        where: { id: order.tradeOperation.id },
        data: { externalOfferId: offerId },
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        if (strict) {
          await this.openDisputeForReferenceIssue({
            order: order as DisputeOrderContext,
            actorUserId: params.actorUserId ?? params.sellerId,
            idempotencyKey,
            reasonCode: 'TRADE_REFERENCE_SPOOF',
            details: { offerId, uniqueViolation: true },
            source: params.source,
          });
          return {
            orderId: order.id,
            externalOfferId: offerId,
            applied: false,
            idempotent: false,
            disputed: true,
          };
        }
        throw new AppException(
          ErrorCode.BAD_REQUEST,
          'Trade offer id is already linked to another order',
          HttpStatus.BAD_REQUEST,
          { offerId },
        );
      }
      throw error;
    }

    await this.recordAudit({
      orderId: order.id,
      actorUserId: params.actorUserId ?? params.sellerId,
      idempotencyKey,
      beforeState: { externalOfferId: beforeOfferId },
      afterState: { externalOfferId: offerId, source: params.source },
      source: params.source,
    });

    await this.prisma.outboxEvent.create({
      data: {
        eventType: 'TRADE_REFERENCE_RECONCILED',
        aggregateType: 'order',
        aggregateId: order.id,
        payload: {
          orderId: order.id,
          tradeOperationId: order.tradeOperation.id,
          externalOfferId: offerId,
          source: params.source,
        },
      },
    });

    this.logger.log(
      JSON.stringify({
        event: 'trade_reference_reconciled',
        orderId: order.id,
        tradeOperationId: order.tradeOperation.id,
        externalOfferId: offerId,
        source: params.source,
        strict,
      }),
    );

    void this.tradeStatusPoller.pollOrderById(order.id).catch((error) => {
      this.logger.warn(
        `Immediate trade poll failed for order ${order.id}: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
    });

    return {
      orderId: order.id,
      externalOfferId: offerId,
      applied: true,
      idempotent: false,
      disputed: false,
    };
  }

  private async findSpoofedOrder(offerId: string, currentOrderId: string) {
    return this.prisma.tradeOperation.findFirst({
      where: {
        externalOfferId: offerId,
        orderId: { not: currentOrderId },
      },
      select: { orderId: true },
    });
  }

  private async openDisputeForReferenceIssue(params: {
    order: DisputeOrderContext;
    actorUserId: string;
    idempotencyKey: string;
    reasonCode: string;
    details: Record<string, unknown>;
    source: TradeReferenceSource;
  }) {
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.order.findUnique({
        where: { id: params.order.id },
        include: { tradeOperation: true, lot: true },
      });
      if (!current || !current.tradeOperation) {
        return;
      }
      if (current.status !== OrderStatus.WAITING_TRADE) {
        return;
      }

      await tx.tradeOperation.update({
        where: { id: current.tradeOperation.id },
        data: {
          status: TradeOperationStatus.FAILED_DISPUTE,
          failReasonCode: params.reasonCode,
        },
      });

      await this.orderStateService.transitionByEvent(tx, {
        orderId: current.id,
        from: OrderStatus.WAITING_TRADE,
        event: 'MISMATCH_DETECTED',
        actorUserId: params.actorUserId,
        reason: params.reasonCode,
      });

      await this.lotStateService.transition(tx, {
        lotId: current.lotId,
        from: current.lot.status,
        to: LotStatus.BLOCKED,
        actorUserId: params.actorUserId,
      });

      await tx.inventoryAsset.update({
        where: { id: current.lot.inventoryAssetId },
        data: { status: InventoryAssetStatus.BLOCKED },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: params.actorUserId,
          entityType: 'order',
          entityId: current.id,
          action: 'TRADE_REFERENCE_DISPUTE',
          reason: params.reasonCode,
          beforeState: {
            status: OrderStatus.WAITING_TRADE,
            externalOfferId: current.tradeOperation.externalOfferId,
          },
          afterState: {
            status: OrderStatus.DISPUTE,
            reasonCode: params.reasonCode,
            details: params.details,
            source: params.source,
          } as Prisma.InputJsonValue,
          idempotencyKey: params.idempotencyKey,
          ...getAuditContext(),
        },
      });

      await tx.outboxEvent.create({
        data: {
          eventType: 'ORDER_DISPUTE_OPENED',
          aggregateType: 'order',
          aggregateId: current.id,
          payload: {
            orderId: current.id,
            reasonCode: params.reasonCode,
            source: params.source,
          },
        },
      });
    });

    this.logger.warn(
      JSON.stringify({
        event: 'trade_reference_dispute',
        metric: 'trade_reference_dispute_total',
        alert: true,
        orderId: params.order.id,
        reasonCode: params.reasonCode,
        source: params.source,
        ...params.details,
      }),
    );
  }

  private async recordAudit(params: {
    orderId: string;
    actorUserId: string;
    idempotencyKey: string;
    beforeState: Record<string, unknown>;
    afterState: Record<string, unknown>;
    source: TradeReferenceSource;
  }) {
    await this.prisma.auditLog.create({
      data: {
        actorUserId: params.actorUserId,
        entityType: 'order',
        entityId: params.orderId,
        action: 'TRADE_REFERENCE_RECONCILED',
        beforeState: params.beforeState as Prisma.InputJsonValue,
        afterState: { ...params.afterState, source: params.source } as Prisma.InputJsonValue,
        idempotencyKey: params.idempotencyKey,
        ...getAuditContext(),
      },
    });
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === 'P2002'
    );
  }
}
