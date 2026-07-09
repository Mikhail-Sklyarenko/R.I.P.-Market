import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import {
  OrderStatus,
  Prisma,
  TradeTaskExecutionPhase,
  TradeTaskStatus,
} from '@prisma/client';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { PrismaService } from '../prisma/prisma.service';
import {
  extensionTaskMaxAttempts,
  extensionTaskPollBatchSize,
  extensionTaskTtlMs,
} from './extension-task.config';
import { isExtensionUiTradeFlowEnabled } from './extension-ui-trade-flow.config';
import { TradeReferenceReconcileService } from '../trades/trade-reference-reconcile.service';
import { DisputeOpsService } from '../disputes/dispute-ops.service';
import {
  isExtensionDisputeBridgeEnabled,
} from '../disputes/dispute-ops.config';
import {
  OFFER_ERROR_UX_HINTS,
  type ExtensionOfferErrorCodeType,
} from './extension-offer-error-codes';
import { mapExtensionErrorToDisputeReason } from '../disputes/dispute-reason-codes';
import { isValidSteamOfferId } from '../providers/trade/trade-offer.util';
import { AntiFraudRuleService } from '../common/observability/anti-fraud.service';
import { ExtensionFlowMetricsService } from '../common/observability/extension-flow-metrics.service';

export type CreateOfferTaskContext = {
  orderId: string;
  tradeOperationId: string;
  sellerId: string;
  buyerId: string;
  expectedAssetId: string | null;
  marketHashName: string | null;
  buyerTradeUrl: string | null;
  inventoryAssetId: string;
};

const TERMINAL_PHASES = new Set<TradeTaskExecutionPhase>([
  TradeTaskExecutionPhase.OFFER_SENT,
  TradeTaskExecutionPhase.OFFER_FAILED,
]);

const PHASE_ORDER: TradeTaskExecutionPhase[] = [
  TradeTaskExecutionPhase.ACKED,
  TradeTaskExecutionPhase.TRADE_PAGE_OPENED,
  TradeTaskExecutionPhase.OFFER_DRAFTED,
  TradeTaskExecutionPhase.ITEM_SELECTED,
  TradeTaskExecutionPhase.OFFER_SUBMITTED,
  TradeTaskExecutionPhase.CONFIRM_PENDING,
  TradeTaskExecutionPhase.OFFER_SENT,
  TradeTaskExecutionPhase.OFFER_FAILED,
];

@Injectable()
export class ExtensionTradeTaskService {
  private readonly logger = new Logger(ExtensionTradeTaskService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tradeReferenceReconcileService: TradeReferenceReconcileService,
    private readonly disputeOpsService: DisputeOpsService,
    private readonly extensionFlowMetrics: ExtensionFlowMetricsService,
    private readonly antiFraud: AntiFraudRuleService,
  ) {}

  async createOfferTask(params: CreateOfferTaskContext): Promise<void> {
    const dedupKey = `create_offer:${params.tradeOperationId}`;
    const idempotencyKey = `trade-task:${dedupKey}`;
    const expiresAt = new Date(Date.now() + extensionTaskTtlMs());

    await this.prisma.tradeTask.upsert({
      where: { orderId_dedupKey: { orderId: params.orderId, dedupKey } },
      create: {
        orderId: params.orderId,
        tradeOperationId: params.tradeOperationId,
        type: 'create_offer',
        status: TradeTaskStatus.CREATED,
        dedupKey,
        idempotencyKey,
        maxAttempts: extensionTaskMaxAttempts(),
        expiresAt,
        payload: {
          orderId: params.orderId,
          tradeOperationId: params.tradeOperationId,
          sellerId: params.sellerId,
          buyerId: params.buyerId,
          expectedAssetId: params.expectedAssetId,
          marketHashName: params.marketHashName,
          buyerTradeUrl: params.buyerTradeUrl,
          inventoryAssetId: params.inventoryAssetId,
          idempotencyKey,
          uiTradeFlow: isExtensionUiTradeFlowEnabled(),
        },
      },
      update: {},
    });

    this.logger.log(
      JSON.stringify({
        event: 'trade_task_created',
        orderId: params.orderId,
        tradeOperationId: params.tradeOperationId,
        dedupKey,
        expectedAssetId: params.expectedAssetId,
      }),
    );
  }

  async pollTasks(sessionId: string, limit?: number) {
    const now = new Date();
    const cappedLimit = Math.min(
      extensionTaskPollBatchSize(),
      Math.max(1, limit ?? extensionTaskPollBatchSize()),
    );

    const session = await this.prisma.extensionSession.findUnique({
      where: { id: sessionId },
      select: { userId: true },
    });
    if (!session) {
      return [];
    }

    const tasks = await this.prisma.tradeTask.findMany({
      where: {
        order: {
          sellerId: session.userId,
          status: OrderStatus.WAITING_TRADE,
        },
        status: { in: [TradeTaskStatus.CREATED, TradeTaskStatus.DISPATCHED] },
        OR: [
          { executionPhase: null },
          { executionPhase: TradeTaskExecutionPhase.ACKED },
          { executionPhase: TradeTaskExecutionPhase.OFFER_DRAFTED },
        ],
        expiresAt: { gt: now },
        AND: [
          {
            OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
          },
        ],
      },
      orderBy: [{ createdAt: 'desc' }],
      take: cappedLimit,
    });

    for (const task of tasks) {
      await this.prisma.tradeTask.update({
        where: { id: task.id },
        data: {
          status: TradeTaskStatus.DISPATCHED,
          dispatchedAt: now,
        },
      });
      this.logger.log(
        JSON.stringify({
          event: 'trade_task_dispatched',
          taskId: task.id,
          orderId: task.orderId,
          tradeOperationId: task.tradeOperationId,
          attempt: task.attemptCount,
          executionPhase: task.executionPhase,
        }),
      );
    }

    return tasks.map((task) => ({
      id: task.id,
      type: task.type,
      orderId: task.orderId,
      tradeOperationId: task.tradeOperationId,
      idempotencyKey: task.idempotencyKey,
      executionPhase: task.executionPhase,
      payload: task.payload,
      expiresAt: task.expiresAt.toISOString(),
      attemptCount: task.attemptCount,
    }));
  }

  async reportTaskProgress(params: {
    taskId: string;
    phase: TradeTaskExecutionPhase;
    idempotencyKey: string;
    reasonCode?: string | null;
    offerId?: string | null;
    details?: Prisma.JsonObject;
  }): Promise<{ ok: true; phase: TradeTaskExecutionPhase; terminal: boolean }> {
    const existing = await this.prisma.tradeTaskStatusEvent.findUnique({
      where: {
        tradeTaskId_idempotencyKey: {
          tradeTaskId: params.taskId,
          idempotencyKey: params.idempotencyKey,
        },
      },
    });
    if (existing) {
      return {
        ok: true,
        phase: existing.phase,
        terminal: TERMINAL_PHASES.has(existing.phase),
      };
    }

    const task = await this.prisma.tradeTask.findUnique({
      where: { id: params.taskId },
    });
    if (!task) {
      throw new AppException(
        ErrorCode.EXTENSION_TASK_NOT_FOUND,
        'Trade task not found',
        HttpStatus.NOT_FOUND,
      );
    }
    if (
      task.status === TradeTaskStatus.EXPIRED ||
      task.status === TradeTaskStatus.FAILED
    ) {
      throw new AppException(
        ErrorCode.EXTENSION_TASK_INVALID_ACK,
        `Cannot report progress for task in status ${task.status}`,
      );
    }
    if (
      task.executionPhase &&
      TERMINAL_PHASES.has(task.executionPhase) &&
      params.phase !== task.executionPhase
    ) {
      throw new AppException(
        ErrorCode.EXTENSION_TASK_INVALID_ACK,
        'Task already reached terminal execution phase',
      );
    }

    this.ensurePhaseTransition(task.executionPhase, params.phase);

    const offerSentReconcile = await this.prisma.$transaction(async (tx) => {
      await tx.tradeTaskStatusEvent.create({
        data: {
          tradeTaskId: task.id,
          phase: params.phase,
          reasonCode: params.reasonCode ?? null,
          payload: params.details ?? undefined,
          idempotencyKey: params.idempotencyKey,
        },
      });

      if (params.phase === TradeTaskExecutionPhase.OFFER_SENT) {
        const offerId = params.offerId?.trim();
        if (!offerId || !isValidSteamOfferId(offerId)) {
          throw new AppException(
            ErrorCode.EXTENSION_TASK_INVALID_ACK,
            'OFFER_SENT requires a valid Steam offer id',
            HttpStatus.BAD_REQUEST,
          );
        }
        const order = await tx.order.findUnique({
          where: { id: task.orderId },
          select: { sellerId: true },
        });
        const reconcilePayload =
          order
            ? {
                orderId: task.orderId,
                sellerId: order.sellerId,
                offerId,
              }
            : null;
        await tx.tradeTask.update({
          where: { id: task.id },
          data: {
            status: TradeTaskStatus.ACKED,
            executionPhase: TradeTaskExecutionPhase.OFFER_SENT,
            ackedAt: new Date(),
            lastErrorCode: null,
          },
        });
        await tx.outboxEvent.create({
          data: {
            eventType: 'TRADE_TASK_OFFER_SENT',
            aggregateType: 'trade_task',
            aggregateId: task.id,
            payload: {
              taskId: task.id,
              orderId: task.orderId,
              tradeOperationId: task.tradeOperationId,
              offerId: offerId ?? null,
            },
          },
        });
        return reconcilePayload;
      }

      if (params.phase === TradeTaskExecutionPhase.OFFER_FAILED) {
        const reason = params.reasonCode ?? 'OFFER_SEND_FAILED';
        const hint =
          OFFER_ERROR_UX_HINTS[reason as ExtensionOfferErrorCodeType];
        const nextAttemptCount = task.attemptCount + 1;
        const canRetry =
          nextAttemptCount < task.maxAttempts && (hint?.retryable ?? true);
        await tx.tradeTask.update({
          where: { id: task.id },
          data: {
            status: canRetry
              ? TradeTaskStatus.DISPATCHED
              : TradeTaskStatus.FAILED,
            executionPhase: canRetry
              ? null
              : TradeTaskExecutionPhase.OFFER_FAILED,
            attemptCount: nextAttemptCount,
            failedAt: canRetry ? null : new Date(),
            lastErrorCode: reason,
            nextAttemptAt: canRetry
              ? new Date(Date.now() + this.backoffMs(nextAttemptCount))
              : null,
          },
        });
        await tx.outboxEvent.create({
          data: {
            eventType: 'TRADE_TASK_OFFER_FAILED',
            aggregateType: 'trade_task',
            aggregateId: task.id,
            payload: {
              taskId: task.id,
              orderId: task.orderId,
              tradeOperationId: task.tradeOperationId,
              reasonCode: reason,
            },
          },
        });
        return;
      }

      await tx.tradeTask.update({
        where: { id: task.id },
        data: {
          executionPhase: params.phase,
          lastErrorCode: params.reasonCode ?? null,
        },
      });
      return null;
    });

    if (offerSentReconcile) {
      await this.tradeReferenceReconcileService.reconcile({
        orderId: offerSentReconcile.orderId,
        sellerId: offerSentReconcile.sellerId,
        offerId: offerSentReconcile.offerId,
        idempotencyKey: `task-offer-sent:${task.id}:${offerSentReconcile.offerId}`,
        source: 'EXTENSION',
        actorUserId: offerSentReconcile.sellerId,
      });
    }

    if (
      params.phase === TradeTaskExecutionPhase.OFFER_FAILED &&
      task.attemptCount >= task.maxAttempts
    ) {
      await this.maybeBridgeExtensionDispute(
        task.orderId,
        params.reasonCode ?? 'OFFER_SEND_FAILED',
      );
    }

    if (params.phase === TradeTaskExecutionPhase.OFFER_FAILED) {
      const order = await this.prisma.order.findUnique({
        where: { id: task.orderId },
        select: { sellerId: true },
      });
      this.extensionFlowMetrics.recordTaskOutcome({
        orderId: task.orderId,
        taskId: task.id,
        success: false,
        reasonCode: params.reasonCode ?? 'OFFER_SEND_FAILED',
        sellerId: order?.sellerId,
      });
      if (order?.sellerId) {
        this.antiFraud.recordTaskFailure(order.sellerId, task.orderId);
      }
    }

    if (params.phase === TradeTaskExecutionPhase.OFFER_SENT) {
      const order = await this.prisma.order.findUnique({
        where: { id: task.orderId },
        select: { sellerId: true },
      });
      this.extensionFlowMetrics.recordTaskOutcome({
        orderId: task.orderId,
        taskId: task.id,
        success: true,
        sellerId: order?.sellerId,
      });
    }

    this.logger.log(
      JSON.stringify({
        event: 'trade_task_progress',
        taskId: params.taskId,
        orderId: task.orderId,
        tradeOperationId: task.tradeOperationId,
        phase: params.phase,
        reasonCode: params.reasonCode ?? null,
        offerId: params.offerId ?? null,
      }),
    );

    return {
      ok: true,
      phase: params.phase,
      terminal: TERMINAL_PHASES.has(params.phase),
    };
  }

  async ackTask(taskId: string, payload: Prisma.JsonObject): Promise<void> {
    const task = await this.prisma.tradeTask.findUnique({ where: { id: taskId } });
    if (!task) {
      throw new AppException(
        ErrorCode.EXTENSION_TASK_NOT_FOUND,
        'Trade task not found',
        HttpStatus.NOT_FOUND,
      );
    }
    if (task.status === TradeTaskStatus.ACKED) {
      return;
    }
    if (task.status === TradeTaskStatus.EXPIRED || task.status === TradeTaskStatus.FAILED) {
      throw new AppException(
        ErrorCode.EXTENSION_TASK_INVALID_ACK,
        `Cannot ack task in status ${task.status}`,
      );
    }

    await this.prisma.tradeTask.update({
      where: { id: task.id },
      data: {
        status: TradeTaskStatus.ACKED,
        executionPhase: TradeTaskExecutionPhase.ACKED,
        ackedAt: new Date(),
        lastErrorCode: null,
      },
    });
    await this.prisma.outboxEvent.create({
      data: {
        eventType: 'TRADE_TASK_ACKED',
        aggregateType: 'trade_task',
        aggregateId: task.id,
        payload: {
          taskId: task.id,
          orderId: task.orderId,
          tradeOperationId: task.tradeOperationId,
          ack: payload,
        },
      },
    });
  }

  async nackTask(taskId: string, reasonCode: string): Promise<void> {
    const task = await this.prisma.tradeTask.findUnique({ where: { id: taskId } });
    if (!task) {
      throw new AppException(
        ErrorCode.EXTENSION_TASK_NOT_FOUND,
        'Trade task not found',
        HttpStatus.NOT_FOUND,
      );
    }
    const now = new Date();
    const willFail = task.attemptCount >= task.maxAttempts;
    await this.prisma.tradeTask.update({
      where: { id: task.id },
      data: {
        status: willFail ? TradeTaskStatus.FAILED : TradeTaskStatus.DISPATCHED,
        executionPhase: TradeTaskExecutionPhase.OFFER_FAILED,
        failedAt: willFail ? now : null,
        lastErrorCode: reasonCode,
        nextAttemptAt: willFail
          ? null
          : new Date(Date.now() + this.backoffMs(task.attemptCount + 1)),
      },
    });
  }

  @Interval(5_000)
  async sweepExpiredAndDead(): Promise<void> {
    if (
      process.env.JEST_WORKER_ID !== undefined ||
      process.env.ENABLE_TEST_ROUTES === 'true'
    ) {
      return;
    }
    await this.expireTasks();
    await this.reopenFailedRetryableTasksForWaitingOrders();
    await this.reopenExpiredTasksForWaitingOrders();
    await this.failOverRetriedTasks();
  }

  /** Re-open FAILED tasks that can still retry while order is waiting for trade. */
  async reopenFailedRetryableTasksForWaitingOrders(): Promise<number> {
    const failed = await this.prisma.tradeTask.findMany({
      where: {
        status: TradeTaskStatus.FAILED,
        order: { status: OrderStatus.WAITING_TRADE },
        attemptCount: { lt: extensionTaskMaxAttempts() },
        lastErrorCode: {
          in: [
            'OFFER_SEND_FAILED',
            'INVENTORY_NOT_LOADED',
            'STEAM_UNAVAILABLE',
            'STALE_ORDER_SUPERSEDED',
          ],
        },
      },
      take: 100,
    });

    let reopened = 0;
    for (const task of failed) {
      await this.prisma.tradeTask.update({
        where: { id: task.id },
        data: {
          status: TradeTaskStatus.DISPATCHED,
          executionPhase: null,
          failedAt: null,
          nextAttemptAt: new Date(),
        },
      });
      reopened += 1;
    }
    return reopened;
  }

  async reopenExpiredTasksForWaitingOrders(): Promise<number> {
    const expired = await this.prisma.tradeTask.findMany({
      where: {
        status: TradeTaskStatus.EXPIRED,
        lastErrorCode: 'TASK_TTL_EXPIRED',
        order: { status: OrderStatus.WAITING_TRADE },
      },
      take: 100,
    });

    let reopened = 0;
    for (const task of expired) {
      if (task.attemptCount >= task.maxAttempts) {
        continue;
      }
      await this.prisma.tradeTask.update({
        where: { id: task.id },
        data: {
          status: TradeTaskStatus.DISPATCHED,
          executionPhase: null,
          lastErrorCode: null,
          failedAt: null,
          nextAttemptAt: new Date(),
          expiresAt: new Date(Date.now() + extensionTaskTtlMs()),
        },
      });
      reopened += 1;
    }
    return reopened;
  }

  async expireTasks(): Promise<number> {
    const expired = await this.prisma.tradeTask.findMany({
      where: {
        status: { in: [TradeTaskStatus.CREATED, TradeTaskStatus.DISPATCHED] },
        expiresAt: { lte: new Date() },
      },
      take: 100,
    });
    for (const task of expired) {
      await this.prisma.tradeTask.update({
        where: { id: task.id },
        data: {
          status: TradeTaskStatus.EXPIRED,
          failedAt: new Date(),
          lastErrorCode: 'TASK_TTL_EXPIRED',
        },
      });
      await this.prisma.outboxEvent.create({
        data: {
          eventType: 'TRADE_TASK_EXPIRED',
          aggregateType: 'trade_task',
          aggregateId: task.id,
          payload: {
            taskId: task.id,
            orderId: task.orderId,
            tradeOperationId: task.tradeOperationId,
          },
        },
      });
    }
    return expired.length;
  }

  async failOverRetriedTasks(): Promise<number> {
    const dead = await this.prisma.tradeTask.findMany({
      where: {
        status: TradeTaskStatus.DISPATCHED,
        attemptCount: { gte: extensionTaskMaxAttempts() },
      },
      take: 100,
    });
    for (const task of dead) {
      await this.prisma.tradeTask.update({
        where: { id: task.id },
        data: {
          status: TradeTaskStatus.FAILED,
          executionPhase: TradeTaskExecutionPhase.OFFER_FAILED,
          failedAt: new Date(),
          nextAttemptAt: null,
          lastErrorCode: task.lastErrorCode ?? 'MAX_ATTEMPTS_REACHED',
        },
      });
      await this.prisma.outboxEvent.create({
        data: {
          eventType: 'TRADE_TASK_FAILED',
          aggregateType: 'trade_task',
          aggregateId: task.id,
          payload: {
            taskId: task.id,
            orderId: task.orderId,
            tradeOperationId: task.tradeOperationId,
            reasonCode: 'MAX_ATTEMPTS_REACHED',
          },
        },
      });
      await this.maybeBridgeExtensionDispute(task.orderId, 'MAX_ATTEMPTS_REACHED');
    }
    return dead.length;
  }

  private async maybeBridgeExtensionDispute(
    orderId: string,
    extensionErrorCode: string,
  ): Promise<void> {
    if (!isExtensionDisputeBridgeEnabled()) {
      return;
    }
    const reasonCode = mapExtensionErrorToDisputeReason(extensionErrorCode);
    if (!reasonCode) {
      return;
    }
    await this.disputeOpsService.openSystemDispute({
      orderId,
      reasonCode,
      source: 'EXTENSION',
      idempotencyKey: `ext-dispute:${orderId}:${reasonCode}`,
      details: { extensionErrorCode },
    });
  }

  private ensurePhaseTransition(
    current: TradeTaskExecutionPhase | null,
    next: TradeTaskExecutionPhase,
  ): void {
    if (!current || current === next) {
      return;
    }
    if (TERMINAL_PHASES.has(current)) {
      throw new AppException(
        ErrorCode.EXTENSION_TASK_INVALID_ACK,
        `Cannot transition from terminal phase ${current}`,
      );
    }
    const currentIdx = PHASE_ORDER.indexOf(current);
    const nextIdx = PHASE_ORDER.indexOf(next);
    if (next === TradeTaskExecutionPhase.OFFER_FAILED) {
      return;
    }
    if (nextIdx < currentIdx) {
      throw new AppException(
        ErrorCode.EXTENSION_TASK_INVALID_ACK,
        `Invalid phase regression: ${current} -> ${next}`,
      );
    }
  }

  private backoffMs(retryCount: number): number {
    return Math.min(60_000, 1000 * 2 ** retryCount);
  }
}
