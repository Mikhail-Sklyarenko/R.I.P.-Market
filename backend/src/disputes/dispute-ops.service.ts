import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  InventoryAssetStatus,
  LotStatus,
  OrderStatus,
  Prisma,
  TradeOperationStatus,
} from '@prisma/client';
import { getAuditContext } from '../common/observability/audit-context';
import { AntiFraudRuleService } from '../common/observability/anti-fraud.service';
import { ExtensionFlowMetricsService } from '../common/observability/extension-flow-metrics.service';
import { LotStateService } from '../lots/lot-state.service';
import { OrderStateService } from '../orders/order-state.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  assertDisputeReasonAllowed,
  DISPUTE_REASON_REGISTRY,
  getDisputeReasonDefinition,
  isKnownDisputeReasonCode,
} from './dispute-reason-codes';
import type { DisputeReasonSource } from './dispute-reason-codes';

export type DisputeTimelineEntry = {
  id: string;
  at: string;
  kind:
    | 'ORDER_STATUS'
    | 'LOT_STATUS'
    | 'TRADE_OP_STATUS'
    | 'AUDIT'
    | 'OUTBOX'
    | 'POLL'
    | 'TASK'
    | 'VERIFICATION';
  title: string;
  reasonCode?: string | null;
  actorUserId?: string | null;
  detail?: Record<string, unknown>;
};

export type OpenSystemDisputeParams = {
  orderId: string;
  reasonCode: string;
  source: DisputeReasonSource;
  idempotencyKey: string;
  actorUserId?: string | null;
  reasonNote?: string | null;
  details?: Record<string, unknown>;
};

@Injectable()
export class DisputeOpsService {
  private readonly logger = new Logger(DisputeOpsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orderStateService: OrderStateService,
    private readonly lotStateService: LotStateService,
    private readonly extensionFlowMetrics: ExtensionFlowMetricsService,
    private readonly antiFraud: AntiFraudRuleService,
  ) {}

  listReasonCodes() {
    return { reasons: DISPUTE_REASON_REGISTRY };
  }

  async buildOrderTimeline(orderId: string): Promise<DisputeTimelineEntry[]> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { tradeOperation: true, lot: true },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const [
      orderStatusEvents,
      lotStatusEvents,
      tradeOpStatusEvents,
      auditLogs,
      outboxEvents,
      pollEvents,
      tasks,
      snapshots,
    ] = await Promise.all([
      this.prisma.orderStatusEvent.findMany({
        where: { orderId },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.lotStatusEvent.findMany({
        where: { lotId: order.lotId },
        orderBy: { createdAt: 'asc' },
      }),
      order.tradeOperation
        ? this.prisma.tradeOperationStatusEvent.findMany({
            where: { tradeOperationId: order.tradeOperation.id },
            orderBy: { createdAt: 'asc' },
          })
        : Promise.resolve([]),
      this.prisma.auditLog.findMany({
        where: { entityType: 'order', entityId: orderId },
        orderBy: { createdAt: 'asc' },
        take: 300,
      }),
      this.prisma.outboxEvent.findMany({
        where: { aggregateType: 'order', aggregateId: orderId },
        orderBy: { createdAt: 'asc' },
        take: 200,
      }),
      order.tradeOperation
        ? this.prisma.tradePollEvent.findMany({
            where: { tradeOperationId: order.tradeOperation.id },
            orderBy: { checkedAt: 'asc' },
            take: 100,
          })
        : Promise.resolve([]),
      this.prisma.tradeTask.findMany({
        where: { orderId },
        orderBy: { createdAt: 'asc' },
        include: {
          statusEvents: { orderBy: { createdAt: 'asc' }, take: 20 },
        },
      }),
      this.prisma.tradeVerificationSnapshot.findMany({
        where: { orderId },
        orderBy: { createdAt: 'asc' },
        take: 50,
      }),
    ]);

    const entries: DisputeTimelineEntry[] = [];

    for (const event of orderStatusEvents) {
      entries.push({
        id: event.id,
        at: event.createdAt.toISOString(),
        kind: 'ORDER_STATUS',
        title: `${event.fromStatus} → ${event.toStatus}`,
        reasonCode: event.reason,
        actorUserId: event.actorUserId,
        detail: {
          fromStatus: event.fromStatus,
          toStatus: event.toStatus,
        },
      });
    }

    for (const event of lotStatusEvents) {
      entries.push({
        id: event.id,
        at: event.createdAt.toISOString(),
        kind: 'LOT_STATUS',
        title: `${event.fromStatus} → ${event.toStatus}`,
        reasonCode: event.reason,
        actorUserId: event.actorUserId,
      });
    }

    for (const event of tradeOpStatusEvents) {
      entries.push({
        id: event.id,
        at: event.createdAt.toISOString(),
        kind: 'TRADE_OP_STATUS',
        title: `${event.fromStatus} → ${event.toStatus}`,
        reasonCode: event.reason,
        actorUserId: event.actorUserId,
        detail: {
          event: event.event,
          fromStatus: event.fromStatus,
          toStatus: event.toStatus,
        },
      });
    }

    for (const log of auditLogs) {
      entries.push({
        id: log.id,
        at: log.createdAt.toISOString(),
        kind: 'AUDIT',
        title: log.action,
        reasonCode:
          typeof log.reason === 'string'
            ? log.reason
            : ((log.afterState as Prisma.JsonObject | null)?.reasonCode as
                | string
                | undefined),
        actorUserId: log.actorUserId,
        detail: {
          beforeState: log.beforeState,
          afterState: log.afterState,
          idempotencyKey: log.idempotencyKey,
        },
      });
    }

    for (const event of outboxEvents) {
      entries.push({
        id: event.id,
        at: event.createdAt.toISOString(),
        kind: 'OUTBOX',
        title: event.eventType,
        reasonCode:
          (event.payload as Prisma.JsonObject | null)?.reasonCode?.toString() ??
          null,
        detail: event.payload as Record<string, unknown>,
      });
    }

    for (const poll of pollEvents) {
      entries.push({
        id: poll.id,
        at: poll.checkedAt.toISOString(),
        kind: 'POLL',
        title: `${poll.strategy ?? 'POLL'}: ${poll.outcome}`,
        reasonCode: poll.error ?? poll.offerStatus,
        detail: {
          offerStatus: poll.offerStatus,
          strategy: poll.strategy,
          error: poll.error,
        },
      });
    }

    for (const task of tasks) {
      entries.push({
        id: task.id,
        at: task.createdAt.toISOString(),
        kind: 'TASK',
        title: `Task ${task.type} ${task.status}`,
        reasonCode: task.lastErrorCode,
        detail: {
          executionPhase: task.executionPhase,
          attemptCount: task.attemptCount,
        },
      });
      for (const event of task.statusEvents) {
        entries.push({
          id: event.id,
          at: event.createdAt.toISOString(),
          kind: 'TASK',
          title: `Task phase ${event.phase}`,
          reasonCode: event.reasonCode,
          detail: { payload: event.payload },
        });
      }
    }

    for (const snapshot of snapshots) {
      entries.push({
        id: snapshot.id,
        at: snapshot.createdAt.toISOString(),
        kind: 'VERIFICATION',
        title: `Shadow ${snapshot.source}: ${snapshot.observedStatus}`,
        detail: snapshot.payload as Record<string, unknown>,
      });
    }

    entries.sort((a, b) => a.at.localeCompare(b.at));
    return entries;
  }

  async openSystemDispute(params: OpenSystemDisputeParams): Promise<boolean> {
    if (!isKnownDisputeReasonCode(params.reasonCode)) {
      throw new BadRequestException(`Unknown dispute reason: ${params.reasonCode}`);
    }
    assertDisputeReasonAllowed(params.reasonCode, params.source);

    const auditAction = 'SYSTEM_DISPUTE_OPENED';
    const existing = await this.prisma.auditLog.findFirst({
      where: {
        entityType: 'order',
        entityId: params.orderId,
        action: auditAction,
        idempotencyKey: params.idempotencyKey,
      },
    });
    if (existing) {
      return false;
    }

    const opened = await this.prisma.$transaction(async (tx) => {
      const current = await tx.order.findUnique({
        where: { id: params.orderId },
        include: { lot: true, tradeOperation: true },
      });
      if (!current) {
        throw new NotFoundException('Order not found');
      }
      if (current.status === OrderStatus.DISPUTE) {
        return false;
      }
      if (!this.canAutoOpenFromStatus(current.status)) {
        return false;
      }

      await this.orderStateService.transition(tx, {
        orderId: params.orderId,
        from: current.status,
        to: OrderStatus.DISPUTE,
        actorUserId: params.actorUserId ?? undefined,
        reason: params.reasonCode,
      });

      if (current.tradeOperation) {
        await tx.tradeOperation.update({
          where: { id: current.tradeOperation.id },
          data: {
            status: TradeOperationStatus.FAILED_DISPUTE,
            failReasonCode: params.reasonCode,
          },
        });
      }

      await this.lotStateService.transition(tx, {
        lotId: current.lotId,
        from: current.lot.status,
        to: LotStatus.BLOCKED,
        actorUserId: params.actorUserId ?? undefined,
        reason: params.reasonCode,
      });

      await tx.inventoryAsset.update({
        where: { id: current.lot.inventoryAssetId },
        data: { status: InventoryAssetStatus.BLOCKED },
      });

      const definition = getDisputeReasonDefinition(params.reasonCode);
      await tx.auditLog.create({
        data: {
          actorUserId: params.actorUserId ?? null,
          entityType: 'order',
          entityId: params.orderId,
          action: auditAction,
          reason: params.reasonNote ?? params.reasonCode,
          beforeState: {
            status: current.status,
            tradeStatus: current.tradeOperation?.status ?? null,
          },
          afterState: {
            status: OrderStatus.DISPUTE,
            reasonCode: params.reasonCode,
            category: definition?.category ?? null,
            reviewType: definition?.reviewType ?? null,
            source: params.source,
            details: params.details ?? null,
          } as Prisma.InputJsonValue,
          idempotencyKey: params.idempotencyKey,
          ...getAuditContext(),
        },
      });

      await tx.outboxEvent.create({
        data: {
          eventType: 'ORDER_DISPUTE_OPENED',
          aggregateType: 'order',
          aggregateId: params.orderId,
          payload: {
            orderId: params.orderId,
            reasonCode: params.reasonCode,
            source: params.source,
            reviewType: definition?.reviewType ?? null,
            openedBy: params.source.toLowerCase(),
          },
        },
      });

      return true;
    });

    if (opened) {
      const order = await this.prisma.order.findUnique({
        where: { id: params.orderId },
        select: { sellerId: true, buyerId: true },
      });
      this.extensionFlowMetrics.recordOrderDisputed({
        orderId: params.orderId,
        reasonCode: params.reasonCode,
        source: params.source,
        sellerId: order?.sellerId,
      });
      if (order?.sellerId) {
        this.antiFraud.recordDisputeOpened(order.sellerId, params.orderId);
      }
      this.logger.warn(
        JSON.stringify({
          event: 'system_dispute_opened',
          metric: 'system_dispute_opened_total',
          alert: true,
          orderId: params.orderId,
          reasonCode: params.reasonCode,
          source: params.source,
        }),
      );
    }

    return opened;
  }

  private canAutoOpenFromStatus(status: OrderStatus): boolean {
    return (
      status === OrderStatus.WAITING_TRADE ||
      status === OrderStatus.TRADE_CONFIRMED ||
      status === OrderStatus.SETTLEMENT_HOLD
    );
  }
}
