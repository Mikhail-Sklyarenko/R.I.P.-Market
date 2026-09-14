import {
  forwardRef,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import {
  OrderStatus,
  Prisma,
  TradeTaskExecutionPhase,
  TradeTaskStatus,
} from '@prisma/client';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { readJsonString } from '../common/json-string.util';
import { PrismaService } from '../prisma/prisma.service';
import {
  extensionTaskMaxAttempts,
  extensionTaskPollBatchSize,
  extensionTaskTtlMs,
} from './extension-task.config';
import { isExtensionUiTradeFlowEnabled } from './extension-ui-trade-flow.config';
import { TradeReferenceReconcileService } from '../trades/trade-reference-reconcile.service';
import { TradeStatusPollerService } from '../trades/trade-status-poller.service';
import { DisputeOpsService } from '../disputes/dispute-ops.service';
import { isExtensionDisputeBridgeEnabled } from '../disputes/dispute-ops.config';
import {
  isOfferErrorRetryable,
  resolveOfferFailureReason,
  shouldTriggerDeliveryCheckAfterOfferFailure,
} from './extension-offer-error-codes';
import { mapExtensionErrorToDisputeReason } from '../disputes/dispute-reason-codes';
import { isValidSteamOfferId } from '../providers/trade/trade-offer.util';
import { AntiFraudRuleService } from '../common/observability/anti-fraud.service';
import { ExtensionFlowMetricsService } from '../common/observability/extension-flow-metrics.service';
import { ExtensionTradeAckService } from './extension-trade-ack.service';

export type CreateOfferTaskContext = {
  orderId: string;
  tradeOperationId: string;
  sellerId: string;
  buyerId: string;
  expectedAssetId: string | null;
  expectedFloatValue: string | null;
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
    private readonly extensionTradeAckService: ExtensionTradeAckService,
    @Inject(forwardRef(() => TradeStatusPollerService))
    private readonly tradeStatusPoller: TradeStatusPollerService,
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
          expectedFloatValue: params.expectedFloatValue,
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
      select: { userId: true, deviceId: true },
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
        // Only pre-submit phases. Never redistribute ITEM_SELECTED /
        // OFFER_SUBMITTED / CONFIRM_PENDING — Steam may already have the offer
        // (or Guard is pending); a second create_offer pass duplicates offers
        // and stamps false mismatch on the order. Stuck recovery: TTL reopen.
        OR: [
          { executionPhase: null },
          { executionPhase: TradeTaskExecutionPhase.ACKED },
          { executionPhase: TradeTaskExecutionPhase.TRADE_PAGE_OPENED },
          { executionPhase: TradeTaskExecutionPhase.OFFER_DRAFTED },
        ],
        expiresAt: { gt: now },
        sendStartedAt: null,
        AND: [
          {
            OR: [
              { leaseUntil: null },
              { leaseUntil: { lte: now } },
              { leaseDeviceId: session.deviceId },
            ],
          },
          {
            OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
          },
        ],
      },
      orderBy: [{ createdAt: 'desc' }],
      take: cappedLimit,
    });

    const claimed = [] as typeof tasks;
    for (const task of tasks) {
      const changed = await this.prisma.tradeTask.updateMany({
        where: {
          id: task.id,
          order: { status: OrderStatus.WAITING_TRADE },
          expiresAt: { gt: now },
          status: task.status,
          executionPhase: task.executionPhase,
          sendStartedAt: null,
          leaseVersion: task.leaseVersion,
          OR: [
            { leaseUntil: null },
            { leaseUntil: { lte: now } },
            { leaseDeviceId: session.deviceId },
          ],
        },
        data: {
          status: TradeTaskStatus.DISPATCHED,
          dispatchedAt: now,
          leaseDeviceId: session.deviceId,
          leaseUntil: new Date(now.getTime() + 120_000),
          leaseVersion:
            task.leaseDeviceId === session.deviceId &&
            task.leaseUntil &&
            task.leaseUntil > now
              ? task.leaseVersion
              : task.leaseVersion + 1,
        },
      });
      if (changed.count !== 1) continue;
      if (
        task.leaseDeviceId !== session.deviceId ||
        !task.leaseUntil ||
        task.leaseUntil <= now
      )
        task.leaseVersion += 1;
      claimed.push(task);
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

    return claimed.map((task) => ({
      id: task.id,
      leaseVersion: task.leaseVersion,
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

  /**
   * I4: cheap hint for extension adaptive polling (heartbeat).
   * Does not dispatch tasks — only signals that work may be waiting.
   */
  async getPendingWorkHint(userId: string): Promise<{
    hasPendingTask: boolean;
    hasActiveDeal: boolean;
  }> {
    const now = new Date();
    const [pendingTask, activeDeal] = await Promise.all([
      this.prisma.tradeTask.findFirst({
        where: {
          order: {
            sellerId: userId,
            status: OrderStatus.WAITING_TRADE,
          },
          status: {
            in: [TradeTaskStatus.CREATED, TradeTaskStatus.DISPATCHED],
          },
          expiresAt: { gt: now },
        },
        select: { id: true },
      }),
      this.prisma.order.findFirst({
        where: {
          OR: [{ sellerId: userId }, { buyerId: userId }],
          status: {
            in: [
              OrderStatus.WAITING_TRADE,
              OrderStatus.TRADE_CONFIRMED,
              OrderStatus.SETTLEMENT_HOLD,
              OrderStatus.DISPUTE,
            ],
          },
        },
        select: { id: true },
      }),
    ]);

    return {
      hasPendingTask: Boolean(pendingTask),
      hasActiveDeal: Boolean(activeDeal),
    };
  }

  async reportTaskProgress(params: {
    taskId: string;
    sessionId?: string;
    leaseVersion?: number;
    phase: TradeTaskExecutionPhase;
    idempotencyKey: string;
    reasonCode?: string | null;
    offerId?: string | null;
    details?: Prisma.JsonObject;
  }): Promise<{ ok: true; phase: TradeTaskExecutionPhase; terminal: boolean }> {
    if (params.sessionId)
      await this.assertTaskOwner(params.taskId, params.sessionId);
    const existing = await this.prisma.tradeTaskStatusEvent.findUnique({
      where: {
        tradeTaskId_idempotencyKey: {
          tradeTaskId: params.taskId,
          idempotencyKey: params.idempotencyKey,
        },
      },
    });

    const task = await this.prisma.tradeTask.findUnique({
      where: { id: params.taskId },
    });

    if (
      params.sessionId &&
      task &&
      params.phase !== TradeTaskExecutionPhase.OFFER_SENT
    ) {
      const session = await this.prisma.extensionSession.findUnique({
        where: { id: params.sessionId },
        select: { deviceId: true },
      });
      if (
        task.leaseDeviceId !== session?.deviceId ||
        params.leaseVersion !== task.leaseVersion
      ) {
        throw new AppException(
          ErrorCode.EXTENSION_TASK_INVALID_ACK,
          'Task lease changed; refresh extension task',
          HttpStatus.CONFLICT,
        );
      }
    }
    if (existing) {
      if (
        existing.phase === TradeTaskExecutionPhase.OFFER_SENT &&
        params.phase === TradeTaskExecutionPhase.OFFER_SENT &&
        task
      ) {
        const storedOfferId = (existing.payload as Prisma.JsonObject | null)
          ?.offerId;
        if (
          typeof storedOfferId === 'string' &&
          storedOfferId !== params.offerId?.trim()
        ) {
          throw new AppException(
            ErrorCode.EXTENSION_TASK_INVALID_ACK,
            'Offer id conflicts with the recorded event',
            HttpStatus.CONFLICT,
          );
        }
        // Legacy events did not persist the offer ID; validate their replay again.
        if (typeof storedOfferId !== 'string') {
          const order = await this.prisma.order.findUnique({
            where: { id: task.orderId },
            select: { sellerId: true },
          });
          if (
            !order ||
            !params.offerId ||
            !isValidSteamOfferId(params.offerId.trim())
          )
            throw new AppException(
              ErrorCode.EXTENSION_TASK_INVALID_ACK,
              'Invalid offer replay',
              HttpStatus.BAD_REQUEST,
            );
          await this.extensionTradeAckService.assertOfferSentTrustGate({
            sellerId: order.sellerId,
            orderId: task.orderId,
            offerId: params.offerId.trim(),
            observed: this.extractObservedFromProgressDetails(params.details),
          });
        }
        await this.ensureOfferLinkedAfterSent({
          taskId: task.id,
          orderId: task.orderId,
          offerId:
            typeof storedOfferId === 'string' ? storedOfferId : params.offerId,
        });
      }
      return {
        ok: true,
        phase: existing.phase,
        terminal: TERMINAL_PHASES.has(existing.phase),
      };
    }

    if (!task) {
      throw new AppException(
        ErrorCode.EXTENSION_TASK_NOT_FOUND,
        'Trade task not found',
        HttpStatus.NOT_FOUND,
      );
    }
    if (
      (task.status === TradeTaskStatus.EXPIRED ||
        task.status === TradeTaskStatus.FAILED) &&
      params.phase !== TradeTaskExecutionPhase.OFFER_SENT
    ) {
      throw new AppException(
        ErrorCode.EXTENSION_TASK_INVALID_ACK,
        `Cannot report progress for task in status ${task.status}`,
      );
    }
    if (
      task.executionPhase &&
      TERMINAL_PHASES.has(task.executionPhase) &&
      params.phase !== task.executionPhase &&
      params.phase !== TradeTaskExecutionPhase.OFFER_SENT
    ) {
      throw new AppException(
        ErrorCode.EXTENSION_TASK_INVALID_ACK,
        'Task already reached terminal execution phase',
      );
    }

    if (params.phase !== TradeTaskExecutionPhase.OFFER_SENT)
      this.ensurePhaseTransition(task.executionPhase, params.phase);

    if (params.phase === TradeTaskExecutionPhase.OFFER_SENT) {
      const offerId = params.offerId?.trim();
      if (!offerId || !isValidSteamOfferId(offerId)) {
        throw new AppException(
          ErrorCode.EXTENSION_TASK_INVALID_ACK,
          'OFFER_SENT requires a valid Steam offer id',
          HttpStatus.BAD_REQUEST,
        );
      }

      const order = await this.prisma.order.findUnique({
        where: { id: task.orderId },
        select: { sellerId: true },
      });
      if (!order) {
        throw new AppException(
          ErrorCode.ORDER_NOT_FOUND,
          'Order not found',
          HttpStatus.NOT_FOUND,
        );
      }

      await this.extensionTradeAckService.assertOfferSentTrustGate({
        sellerId: order.sellerId,
        orderId: task.orderId,
        offerId,
        observed: this.extractObservedFromProgressDetails(params.details),
      });
    }

    const resolvedFailureReason =
      params.phase === TradeTaskExecutionPhase.OFFER_FAILED
        ? resolveOfferFailureReason(params.reasonCode, task.executionPhase)
        : null;

    const progressResult = await this.prisma.$transaction(async (tx) => {
      if (params.phase === TradeTaskExecutionPhase.OFFER_SUBMITTED) {
        const waiting = await tx.order.updateMany({
          where: { id: task.orderId, status: OrderStatus.WAITING_TRADE },
          data: { status: OrderStatus.WAITING_TRADE },
        });
        if (waiting.count !== 1)
          throw new AppException(
            ErrorCode.EXTENSION_TASK_INVALID_ACK,
            'Order no longer accepts a Steam offer',
            HttpStatus.CONFLICT,
          );
      }
      const owned = await tx.tradeTask.updateMany({
        where: {
          id: task.id,
          status: task.status,
          executionPhase: task.executionPhase,
          leaseVersion: task.leaseVersion,
        },
        data: {
          leaseUntil: new Date(Date.now() + 120_000),
          ...(params.phase === TradeTaskExecutionPhase.OFFER_SUBMITTED
            ? { sendStartedAt: new Date() }
            : {}),
        },
      });
      if (owned.count !== 1)
        throw new AppException(
          ErrorCode.EXTENSION_TASK_INVALID_ACK,
          'Task changed concurrently',
          HttpStatus.CONFLICT,
        );
      await tx.tradeTaskStatusEvent.create({
        data: {
          tradeTaskId: task.id,
          phase: params.phase,
          reasonCode: resolvedFailureReason ?? params.reasonCode ?? null,
          payload:
            params.phase === TradeTaskExecutionPhase.OFFER_SENT
              ? { ...params.details, offerId: params.offerId?.trim() }
              : (params.details ?? undefined),
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
        const reconcilePayload = order
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
        const reason = resolvedFailureReason ?? 'OFFER_SEND_FAILED';
        const nextAttemptCount = task.attemptCount + 1;
        const canRetry =
          !task.sendStartedAt &&
          nextAttemptCount < task.maxAttempts &&
          isOfferErrorRetryable(reason, task.executionPhase);
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
              deliveryCheck:
                !canRetry &&
                (shouldTriggerDeliveryCheckAfterOfferFailure(reason) ||
                  task.executionPhase ===
                    TradeTaskExecutionPhase.OFFER_SUBMITTED ||
                  task.executionPhase ===
                    TradeTaskExecutionPhase.CONFIRM_PENDING),
              previousPhase: task.executionPhase,
            },
          },
        });
        return {
          deliveryCheckOrderId: !canRetry ? task.orderId : null,
          reason,
        };
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

    const offerSentReconcile =
      progressResult &&
      'orderId' in progressResult &&
      'offerId' in progressResult
        ? progressResult
        : null;
    const offerFailedResult =
      progressResult && 'deliveryCheckOrderId' in progressResult
        ? progressResult
        : null;

    if (offerSentReconcile) {
      const linked = await this.prisma.tradeOperation.findUnique({
        where: { orderId: offerSentReconcile.orderId },
        select: { externalOfferId: true },
      });
      const linkedOfferId = linked?.externalOfferId?.trim() || null;
      // Trust gate may ignore a duplicate OFFER_SENT; never reconcile a second id.
      if (
        !linkedOfferId ||
        linkedOfferId === offerSentReconcile.offerId.trim()
      ) {
        await this.tradeReferenceReconcileService.reconcile({
          orderId: offerSentReconcile.orderId,
          sellerId: offerSentReconcile.sellerId,
          offerId: offerSentReconcile.offerId,
          idempotencyKey: `task-offer-sent:${task.id}:${offerSentReconcile.offerId}`,
          source: 'EXTENSION',
          actorUserId: offerSentReconcile.sellerId,
        });
        // Happy path: seller "I sent" is automatic — no site hop required.
        try {
          await this.extensionTradeAckService.acknowledge({
            userId: offerSentReconcile.sellerId,
            orderId: offerSentReconcile.orderId,
            type: 'SELLER_ACK_SENT',
            offerId: offerSentReconcile.offerId,
            idempotencyKey: `ack:${offerSentReconcile.orderId}:SELLER_ACK_SENT:auto-offer-sent`,
          });
        } catch (error) {
          this.logger.warn(
            JSON.stringify({
              event: 'seller_ack_auto_failed',
              orderId: offerSentReconcile.orderId,
              message: error instanceof Error ? error.message : 'unknown',
            }),
          );
        }
      } else {
        this.logger.warn(
          JSON.stringify({
            event: 'offer_sent_reconcile_skipped_duplicate',
            orderId: offerSentReconcile.orderId,
            linkedOfferId,
            incomingOfferId: offerSentReconcile.offerId,
          }),
        );
      }
    }

    const failedReason =
      offerFailedResult?.reason ??
      resolveOfferFailureReason(params.reasonCode, task.executionPhase);

    if (
      params.phase === TradeTaskExecutionPhase.OFFER_FAILED &&
      task.attemptCount + 1 >= task.maxAttempts &&
      !shouldTriggerDeliveryCheckAfterOfferFailure(failedReason)
    ) {
      await this.maybeBridgeExtensionDispute(task.orderId, failedReason);
    }

    if (
      params.phase === TradeTaskExecutionPhase.OFFER_FAILED &&
      offerFailedResult?.deliveryCheckOrderId &&
      shouldTriggerDeliveryCheckAfterOfferFailure(failedReason)
    ) {
      this.logger.log(
        JSON.stringify({
          event: 'trade_task_delivery_check_triggered',
          taskId: task.id,
          orderId: task.orderId,
          reasonCode: failedReason,
          previousPhase: task.executionPhase,
        }),
      );
      void this.tradeStatusPoller
        .pollOrderById(offerFailedResult.deliveryCheckOrderId)
        .catch((error) => {
          this.logger.warn(
            `Delivery check after offer failure failed for order ${task.orderId}: ${
              error instanceof Error ? error.message : 'unknown'
            }`,
          );
        });
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
        reasonCode: failedReason,
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
    const task = await this.prisma.tradeTask.findUnique({
      where: { id: taskId },
    });
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
    if (
      task.status === TradeTaskStatus.EXPIRED ||
      task.status === TradeTaskStatus.FAILED
    ) {
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
    const task = await this.prisma.tradeTask.findUnique({
      where: { id: taskId },
    });
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
        sendStartedAt: null,
        status: TradeTaskStatus.FAILED,
        order: { status: OrderStatus.WAITING_TRADE },
        attemptCount: { lt: extensionTaskMaxAttempts() },
        lastErrorCode: {
          in: [
            'OFFER_SEND_FAILED',
            'INVENTORY_NOT_LOADED',
            'INVENTORY_PRIVATE',
            'INVENTORY_RATE_LIMITED',
            'STEAM_COOKIE_EXPIRED',
            'STEAM_UNAVAILABLE',
            'STALE_ORDER_SUPERSEDED',
          ],
        },
      },
      take: 100,
    });

    let reopened = 0;
    for (const task of failed) {
      await this.prisma.tradeTask.updateMany({
        where: {
          id: task.id,
          status: task.status,
          sendStartedAt: null,
          attemptCount: task.attemptCount,
        },
        data: {
          status: TradeTaskStatus.DISPATCHED,
          executionPhase: null,
          leaseUntil: null,
          attemptCount: { increment: 1 },
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
        sendStartedAt: null,
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
      // Never blind-resend after Steam may already have the offer (or Guard).
      if (
        task.executionPhase === TradeTaskExecutionPhase.ITEM_SELECTED ||
        task.executionPhase === TradeTaskExecutionPhase.OFFER_SUBMITTED ||
        task.executionPhase === TradeTaskExecutionPhase.CONFIRM_PENDING ||
        task.executionPhase === TradeTaskExecutionPhase.OFFER_SENT
      ) {
        continue;
      }
      await this.prisma.tradeTask.updateMany({
        where: {
          id: task.id,
          status: task.status,
          sendStartedAt: null,
          attemptCount: task.attemptCount,
        },
        data: {
          status: TradeTaskStatus.DISPATCHED,
          executionPhase: null,
          leaseUntil: null,
          attemptCount: { increment: 1 },
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
    let changedCount = 0;
    for (const task of expired) {
      const changed = await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.tradeTask.updateMany({
          where: {
            id: task.id,
            status: task.status,
            executionPhase: task.executionPhase,
            leaseVersion: task.leaseVersion,
            attemptCount: task.attemptCount,
            expiresAt: task.expiresAt,
            sendStartedAt: task.sendStartedAt,
          },
          data: {
            status: TradeTaskStatus.EXPIRED,
            failedAt: new Date(),
            lastErrorCode: 'TASK_TTL_EXPIRED',
          },
        });
        if (claimed.count !== 1) return false;
        await tx.outboxEvent.create({
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
        return true;
      });
      if (changed) changedCount += 1;
    }
    return changedCount;
  }

  async failOverRetriedTasks(): Promise<number> {
    const dead = await this.prisma.tradeTask.findMany({
      where: {
        status: TradeTaskStatus.DISPATCHED,
        attemptCount: { gte: extensionTaskMaxAttempts() },
      },
      take: 100,
    });
    let changedCount = 0;
    for (const task of dead) {
      const changed = await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.tradeTask.updateMany({
          where: {
            id: task.id,
            status: task.status,
            executionPhase: task.executionPhase,
            leaseVersion: task.leaseVersion,
            attemptCount: task.attemptCount,
            expiresAt: task.expiresAt,
            sendStartedAt: task.sendStartedAt,
          },
          data: {
            status: TradeTaskStatus.FAILED,
            executionPhase: TradeTaskExecutionPhase.OFFER_FAILED,
            failedAt: new Date(),
            nextAttemptAt: null,
            lastErrorCode: task.lastErrorCode ?? 'MAX_ATTEMPTS_REACHED',
          },
        });
        if (claimed.count !== 1) return false;
        await tx.outboxEvent.create({
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
        return true;
      });
      if (!changed) continue;
      changedCount += 1;
      await this.maybeBridgeExtensionDispute(
        task.orderId,
        'MAX_ATTEMPTS_REACHED',
      );
    }
    return changedCount;
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

  private extractObservedFromProgressDetails(
    details?: Prisma.JsonObject,
  ): { assetId?: string | null; floatValue?: string | null } | undefined {
    if (!details) {
      return undefined;
    }

    const assetIdRaw =
      details.observedAssetId ?? details.assetId ?? details.expectedAssetId;
    const floatValueRaw =
      details.observedFloatValue ??
      details.floatValue ??
      details.expectedFloatValue;

    const assetId = readJsonString(assetIdRaw).trim() || null;
    const floatValue = readJsonString(floatValueRaw).trim() || null;

    if (!assetId && !floatValue) {
      return undefined;
    }

    return { assetId, floatValue };
  }

  /**
   * OFFER_SENT can commit while reconcile fails; idempotent retries must re-link.
   */
  private async ensureOfferLinkedAfterSent(params: {
    taskId: string;
    orderId: string;
    offerId?: string | null;
  }): Promise<void> {
    const offerId = params.offerId?.trim();
    if (!offerId || !isValidSteamOfferId(offerId)) {
      return;
    }

    const order = await this.prisma.order.findUnique({
      where: { id: params.orderId },
      select: {
        sellerId: true,
        tradeOperation: { select: { externalOfferId: true } },
      },
    });
    if (!order?.sellerId) {
      return;
    }
    if (order.tradeOperation?.externalOfferId === offerId) {
      return;
    }

    await this.tradeReferenceReconcileService.reconcile({
      orderId: params.orderId,
      sellerId: order.sellerId,
      offerId,
      idempotencyKey: `task-offer-sent:${params.taskId}:${offerId}`,
      source: 'EXTENSION',
      actorUserId: order.sellerId,
    });
  }

  async assertTaskOwner(taskId: string, sessionId: string): Promise<void> {
    const session = await this.prisma.extensionSession.findUnique({
      where: { id: sessionId },
      select: { userId: true },
    });
    const task =
      session &&
      (await this.prisma.tradeTask.findFirst({
        where: { id: taskId, order: { sellerId: session.userId } },
        select: { id: true },
      }));
    if (!task)
      throw new AppException(
        ErrorCode.EXTENSION_TASK_NOT_FOUND,
        'Trade task not found',
        HttpStatus.NOT_FOUND,
      );
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
