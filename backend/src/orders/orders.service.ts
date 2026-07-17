import { forwardRef, HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  InventoryAssetStatus,
  LotStatus,
  OrderStatus,
  TradeOperationStatus,
  UserStatus,
} from '@prisma/client';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { toJsonSafe } from '../common/json-safe.util';
import { getAuditContext } from '../common/observability/audit-context';
import { ExtensionFlowMetricsService } from '../common/observability/extension-flow-metrics.service';
import { LotStateService } from '../lots/lot-state.service';
import { resolveLotTradeExpectations } from '../lots/lot-trade-expectations.util';
import { PrismaService } from '../prisma/prisma.service';
import { getProvidersConfig } from '../providers/config';
import { resolveOrderVerificationMode } from '../trades/trade-verification.config';
import { TradeOperationStateService } from '../trades/trade-operation-state.service';
import {
  extensionTaskMaxAttempts,
  extensionTaskTtlMs,
  isExtensionTaskPipelineEnabled,
} from '../extension/extension-task.config';
import { ExtensionTradeAckService } from '../extension/extension-trade-ack.service';
import type { TradeAcknowledgmentType } from '../extension/extension-trade-ack.types';
import { LedgerService } from '../wallet/ledger.service';
import { ExtensionRolloutService } from '../extension/extension-rollout.service';
import { TradeReferenceReconcileService } from '../trades/trade-reference-reconcile.service';
import { TradeStatusPollerService } from '../trades/trade-status-poller.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { ListMyOrdersQueryDto } from './dto/list-my-orders-query.dto';
import { UpdateTradeReferenceDto } from './dto/update-trade-reference.dto';
import { OrderStateService } from './order-state.service';
import { hasValidTradeUrl } from '../users/trade-url.util';
import { SteamVacService } from '../users/steam-vac.service';
import { BuyRequestMatchingService } from '../buy-requests/buy-request-matching.service';

type LockedLotRow = {
  id: string;
  sellerId: string;
  inventoryAssetId: string;
  status: LotStatus;
  priceMinor: bigint;
  commissionMinor: bigint;
  sellerReceiveMinor: bigint;
};

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerService: LedgerService,
    private readonly lotStateService: LotStateService,
    private readonly orderStateService: OrderStateService,
    private readonly tradeOperationStateService: TradeOperationStateService,
    private readonly tradeReferenceReconcileService: TradeReferenceReconcileService,
    private readonly tradeStatusPoller: TradeStatusPollerService,
    private readonly extensionFlowMetrics: ExtensionFlowMetricsService,
    private readonly extensionRolloutService: ExtensionRolloutService,
    private readonly steamVacService: SteamVacService,
    private readonly buyRequestMatching: BuyRequestMatchingService,
    @Inject(forwardRef(() => ExtensionTradeAckService))
    private readonly extensionTradeAckService: ExtensionTradeAckService,
  ) {}

  async create(buyerId: string, dto: CreateOrderDto, idempotencyKey: string) {
    if (!idempotencyKey) {
      throw new AppException(
        ErrorCode.IDEMPOTENCY_KEY_REQUIRED,
        'Idempotency-Key header is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    const existingAudit = await this.prisma.auditLog.findFirst({
      where: {
        idempotencyKey,
        action: 'ORDER_CREATED',
        entityType: 'order',
      },
    });

    if (existingAudit) {
      return this.getById(existingAudit.entityId, buyerId);
    }

    const buyer = await this.prisma.user.findUnique({ where: { id: buyerId } });
    if (!buyer) {
      throw new AppException(
        ErrorCode.UNAUTHORIZED,
        'Your session is no longer valid. Please sign in again.',
        HttpStatus.UNAUTHORIZED,
      );
    }
    if (buyer.status !== UserStatus.ACTIVE) {
      throw new AppException(
        ErrorCode.BUYER_NOT_ACTIVE,
        'Your buyer account is not active',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!hasValidTradeUrl(buyer.tradeUrl)) {
      throw new AppException(
        ErrorCode.TRADE_URL_REQUIRED,
        'Add your Steam Trade URL in account settings before purchasing',
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.steamVacService.assertCanTrade(buyer);

    const lotPreview = await this.prisma.lot.findUnique({
      where: { id: dto.lotId },
      include: { seller: true },
    });
    if (lotPreview?.seller) {
      if (!hasValidTradeUrl(lotPreview.seller.tradeUrl)) {
        throw new AppException(
          ErrorCode.TRADE_URL_REQUIRED,
          'Seller has no Trade URL — this listing cannot be purchased right now',
          HttpStatus.BAD_REQUEST,
        );
      }
      await this.steamVacService.assertCanTrade(lotPreview.seller);
    }

    try {
      const order = await this.prisma.$transaction(async (tx) => {
        const lockedLots = await tx.$queryRaw<LockedLotRow[]>`
        SELECT id, "sellerId", "inventoryAssetId", status, "priceMinor", "commissionMinor", "sellerReceiveMinor"
        FROM "Lot"
        WHERE id = ${dto.lotId}
        FOR UPDATE
      `;

        const lot = lockedLots[0];
        if (!lot) {
          throw new AppException(
            ErrorCode.LOT_NOT_FOUND,
            'Lot not found',
            HttpStatus.NOT_FOUND,
          );
        }
        if (lot.status !== LotStatus.ACTIVE) {
          throw new AppException(
            ErrorCode.LOT_NOT_ACTIVE,
            'This listing is no longer available',
            HttpStatus.BAD_REQUEST,
            { status: lot.status },
          );
        }
        if (lot.sellerId === buyerId) {
          throw new AppException(
            ErrorCode.CANNOT_BUY_OWN_LOT,
            'You cannot buy your own listing',
            HttpStatus.BAD_REQUEST,
          );
        }

        const openOrder = await tx.order.findFirst({
          where: {
            lotId: lot.id,
            status: {
              in: [
                OrderStatus.CREATED,
                OrderStatus.PAYMENT_RESERVED,
                OrderStatus.WAITING_TRADE,
                OrderStatus.TRADE_CONFIRMED,
                OrderStatus.DISPUTE,
              ],
            },
          },
        });
        if (openOrder) {
          throw new AppException(
            ErrorCode.LOT_HAS_OPEN_ORDER,
            'Someone else is already buying this lot',
            HttpStatus.BAD_REQUEST,
          );
        }

        const buyerWallet = await this.ledgerService.ensureUserWallet(buyerId);

        const createdOrder = await tx.order.create({
          data: {
            lotId: lot.id,
            buyerId,
            sellerId: lot.sellerId,
            status: OrderStatus.CREATED,
            amountMinor: lot.priceMinor,
            holdAmountMinor: lot.priceMinor,
          },
        });

        const hold = await tx.hold.create({
          data: {
            orderId: createdOrder.id,
            walletId: buyerWallet.id,
            amountMinor: lot.priceMinor,
          },
        });

        await this.ledgerService.reservePurchaseHold({
          buyerUserId: buyerId,
          orderId: createdOrder.id,
          holdId: hold.id,
          amountMinor: lot.priceMinor,
          idempotencyKey: `order-reserve:${idempotencyKey}`,
          tx,
        });

        await this.orderStateService.recordCreated(
          tx,
          createdOrder.id,
          buyerId,
        );

        await this.orderStateService.transitionByEvent(tx, {
          orderId: createdOrder.id,
          from: OrderStatus.CREATED,
          event: 'PAYMENT_RESERVED',
          actorUserId: buyerId,
        });

        await this.lotStateService.transition(tx, {
          lotId: lot.id,
          from: lot.status,
          to: LotStatus.RESERVED,
          actorUserId: buyerId,
          extra: { reservedByUserId: buyerId },
        });

        await tx.inventoryAsset.update({
          where: { id: lot.inventoryAssetId },
          data: { status: InventoryAssetStatus.RESERVED },
        });

        const reservedAsset = await tx.inventoryAsset.findUnique({
          where: { id: lot.inventoryAssetId },
          include: { itemDefinition: true },
        });
        const listingSnapshot = await tx.lotListingSnapshot.findUnique({
          where: { lotId: lot.id },
        });
        const tradeExpectations = reservedAsset
          ? resolveLotTradeExpectations(listingSnapshot, reservedAsset)
          : null;

        const tradeOperation = await tx.tradeOperation.create({
          data: {
            orderId: createdOrder.id,
            status: TradeOperationStatus.WAITING,
            verificationMode: this.resolveVerificationMode(),
            expectedAssetId: tradeExpectations?.expectedAssetId ?? null,
          },
        });

        await this.tradeOperationStateService.recordCreated(
          tx,
          tradeOperation.id,
          buyerId,
        );

        if (isExtensionTaskPipelineEnabled()) {
          const rolloutDecision =
            await this.extensionRolloutService.shouldCreateExtensionTaskForSeller(
              lot.sellerId,
            );
          if (rolloutDecision.eligible) {
            const sellerProfile = await tx.user.findUnique({
              where: { id: lot.sellerId },
              select: { steamId: true },
            });
            const buyerProfile = await tx.user.findUnique({
              where: { id: buyerId },
              select: { tradeUrl: true },
            });
            const inventoryAsset = await tx.inventoryAsset.findUnique({
              where: { id: lot.inventoryAssetId },
              include: { itemDefinition: true },
            });
            const snapshotForTask = await tx.lotListingSnapshot.findUnique({
              where: { lotId: lot.id },
            });
            const taskExpectations = inventoryAsset
              ? resolveLotTradeExpectations(snapshotForTask, inventoryAsset)
              : null;
            const dedupKey = `create_offer:${tradeOperation.id}`;
            const idempotencyTaskKey = `trade-task:${dedupKey}`;
            await tx.tradeTask.upsert({
              where: {
                orderId_dedupKey: { orderId: createdOrder.id, dedupKey },
              },
              create: {
                orderId: createdOrder.id,
                tradeOperationId: tradeOperation.id,
                type: 'create_offer',
                dedupKey,
                idempotencyKey: idempotencyTaskKey,
                maxAttempts: extensionTaskMaxAttempts(),
                expiresAt: new Date(Date.now() + extensionTaskTtlMs()),
                payload: {
                  orderId: createdOrder.id,
                  tradeOperationId: tradeOperation.id,
                  sellerId: lot.sellerId,
                  buyerId,
                  expectedAssetId: taskExpectations?.expectedAssetId ?? null,
                  expectedFloatValue:
                    taskExpectations?.expectedFloatValue ?? null,
                  marketHashName: taskExpectations?.marketHashName ?? null,
                  buyerTradeUrl: buyerProfile?.tradeUrl ?? null,
                  inventoryAssetId: lot.inventoryAssetId,
                  idempotencyKey: idempotencyTaskKey,
                  sellerSteamId: sellerProfile?.steamId ?? null,
                },
              },
              update: {},
            });
          }
        }

        await this.orderStateService.transitionByEvent(tx, {
          orderId: createdOrder.id,
          from: OrderStatus.PAYMENT_RESERVED,
          event: 'TRADE_OPERATION_CREATED',
          actorUserId: buyerId,
        });

        const waitingOrder = await tx.order.findUnique({
          where: { id: createdOrder.id },
          include: {
            lot: {
              include: {
                inventoryAsset: { include: { itemDefinition: true } },
              },
            },
            tradeOperation: true,
            hold: true,
          },
        });

        if (!waitingOrder) {
          throw new AppException(
            ErrorCode.INTERNAL_ERROR,
            'Order not found after creation',
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }

        await tx.auditLog.create({
          data: {
            actorUserId: buyerId,
            entityType: 'order',
            entityId: waitingOrder.id,
            action: 'ORDER_CREATED',
            afterState: { status: OrderStatus.WAITING_TRADE },
            idempotencyKey,
            ...getAuditContext(),
          },
        });

        await tx.outboxEvent.create({
          data: {
            eventType: 'ORDER_CREATED',
            aggregateType: 'order',
            aggregateId: waitingOrder.id,
            payload: {
              lotId: lot.id,
              buyerId,
              sellerId: lot.sellerId,
              amountMinor: lot.priceMinor.toString(),
            },
          },
        });

        await tx.outboxEvent.create({
          data: {
            eventType: 'TRADE_OPERATION_CREATED',
            aggregateType: 'order',
            aggregateId: waitingOrder.id,
            payload: { buyerId, sellerId: lot.sellerId },
          },
        });

        return waitingOrder;
      });

      this.extensionFlowMetrics.recordOrderStarted({
        orderId: order.id,
        source: (
          await this.extensionRolloutService.shouldCreateExtensionTaskForSeller(
            order.sellerId,
          )
        ).eligible
          ? 'extension'
          : 'manual',
        sellerId: order.sellerId,
        buyerId: order.buyerId,
      });

      const itemDefinitionId =
        order.lot?.inventoryAsset?.itemDefinitionId ?? null;
      if (itemDefinitionId) {
        void this.buyRequestMatching
          .fulfillForPurchase(buyerId, itemDefinitionId)
          .catch(() => undefined);
      }

      return toJsonSafe(order);
    } catch (error) {
      if (error instanceof AppException) {
        throw error;
      }
      if (
        error instanceof Error &&
        error.message.includes('Insufficient available balance')
      ) {
        throw new AppException(
          ErrorCode.INSUFFICIENT_BALANCE,
          'Not enough available balance to buy this lot',
          HttpStatus.BAD_REQUEST,
        );
      }
      throw error;
    }
  }

  async getById(orderId: string, requesterId?: string) {
    const preflight = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        buyerId: true,
        sellerId: true,
        status: true,
        tradeOperation: { select: { status: true } },
      },
    });

    if (!preflight) {
      throw new AppException(
        ErrorCode.ORDER_NOT_FOUND,
        'Order not found',
        HttpStatus.NOT_FOUND,
      );
    }

    if (
      requesterId &&
      preflight.buyerId !== requesterId &&
      preflight.sellerId !== requesterId
    ) {
      throw new AppException(
        ErrorCode.ORDER_NOT_FOUND,
        'Order not found',
        HttpStatus.NOT_FOUND,
      );
    }

    if (
      preflight.status === OrderStatus.WAITING_TRADE &&
      preflight.tradeOperation?.status === TradeOperationStatus.WAITING
    ) {
      try {
        await this.tradeStatusPoller.pollOrderById(orderId);
      } catch {
        // Best-effort refresh; order details are still returned below.
      }
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        lot: {
          include: { inventoryAsset: { include: { itemDefinition: true } } },
        },
        tradeOperation: true,
        hold: true,
        buyer: { select: { id: true, username: true, tradeUrl: true } },
        seller: { select: { id: true, username: true, tradeUrl: true } },
        statusEvents: {
          orderBy: { createdAt: 'asc' },
        },
        tasks: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            type: true,
            status: true,
            executionPhase: true,
            lastErrorCode: true,
            expiresAt: true,
            attemptCount: true,
            maxAttempts: true,
            createdAt: true,
            updatedAt: true,
            statusEvents: {
              orderBy: { createdAt: 'desc' },
              take: 20,
              select: { reasonCode: true, payload: true, phase: true },
            },
          },
        },
      },
    });

    if (!order) {
      throw new AppException(
        ErrorCode.ORDER_NOT_FOUND,
        'Order not found',
        HttpStatus.NOT_FOUND,
      );
    }

    const { tasks, ...orderRest } = order;
    const rawTask = tasks[0];
    const tradeTask = rawTask
      ? {
          id: rawTask.id,
          type: rawTask.type,
          status: rawTask.status,
          executionPhase: rawTask.executionPhase,
          lastErrorCode: rawTask.lastErrorCode,
          lastErrorMessage: extractTradeTaskErrorMessage(
            rawTask.statusEvents.find(
              (event) =>
                event.phase === 'OFFER_FAILED' ||
                (event.payload &&
                  typeof event.payload === 'object' &&
                  typeof (event.payload as { message?: unknown }).message ===
                    'string'),
            ) ?? rawTask.statusEvents[0],
          ),
          selectedMarketHashName: extractTradeTaskMarketHashName(
            rawTask.statusEvents,
          ),
          expiresAt: rawTask.expiresAt,
          attemptCount: rawTask.attemptCount,
          maxAttempts: rawTask.maxAttempts,
          createdAt: rawTask.createdAt,
          updatedAt: rawTask.updatedAt,
        }
      : null;

    const ackRows = await this.prisma.tradeAcknowledgment.findMany({
      where: { orderId },
      select: { type: true },
    });
    const ackTypes = new Set(ackRows.map((row) => row.type));
    const tradeAcknowledgments = {
      sellerAckSent: ackTypes.has('SELLER_ACK_SENT'),
      buyerPreAccept: ackTypes.has('BUYER_ACK_PRE_ACCEPT'),
      buyerReceived: ackTypes.has('BUYER_ACK_RECEIVED'),
    };

    const latestPoll = order.tradeOperation
      ? await this.prisma.tradePollEvent.findFirst({
          where: { tradeOperationId: order.tradeOperation.id },
          orderBy: { checkedAt: 'desc' },
          select: {
            checkedAt: true,
            offerStatus: true,
            outcome: true,
            strategy: true,
            error: true,
          },
        })
      : null;
    const inventoryHint = latestPoll?.strategy?.includes(':')
      ? (latestPoll.strategy.split(':').pop() ?? null)
      : null;
    const deliveryProbe = latestPoll
      ? {
          checkedAt: latestPoll.checkedAt,
          offerStatus: latestPoll.offerStatus,
          outcome: latestPoll.outcome,
          reasonCode: latestPoll.error,
          inventoryHint:
            inventoryHint === 'seller_still_holds' ||
            inventoryHint === 'confirmed' ||
            inventoryHint === 'pending' ||
            inventoryHint === 'unknown'
              ? inventoryHint
              : null,
        }
      : null;

    return toJsonSafe({
      ...orderRest,
      tradeTask,
      tradeAcknowledgments,
      deliveryProbe,
    });
  }

  /**
   * Explicit delivery re-check for buyer/seller while trade is waiting.
   * Bypasses Steam rate-limit backoff so stuck orders can recover after Guard.
   */
  async checkDelivery(orderId: string, requesterId: string) {
    const preflight = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        buyerId: true,
        sellerId: true,
        status: true,
        tradeOperation: { select: { status: true } },
      },
    });

    if (
      !preflight ||
      (preflight.buyerId !== requesterId && preflight.sellerId !== requesterId)
    ) {
      throw new AppException(
        ErrorCode.ORDER_NOT_FOUND,
        'Order not found',
        HttpStatus.NOT_FOUND,
      );
    }

    if (
      preflight.status !== OrderStatus.WAITING_TRADE ||
      preflight.tradeOperation?.status !== TradeOperationStatus.WAITING
    ) {
      throw new AppException(
        ErrorCode.BAD_REQUEST,
        'Delivery check is only available while the trade is waiting',
        HttpStatus.BAD_REQUEST,
      );
    }

    let transitioned = false;
    try {
      transitioned = await this.tradeStatusPoller.pollOrderById(orderId, {
        force: true,
      });
    } catch {
      // Still return refreshed order; Steam / inventory errors are transient.
    }

    const order = await this.getById(orderId, requesterId);
    return {
      checked: true,
      transitioned,
      order,
    };
  }

  /**
   * Website dual-ack path (JWT). Same rules as extension acknowledge;
   * accelerates delivery verification when the buyer confirms receipt.
   */
  async acknowledgeTrade(
    orderId: string,
    requesterId: string,
    type: TradeAcknowledgmentType,
  ) {
    const preflight = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        buyerId: true,
        sellerId: true,
        tradeOperation: { select: { externalOfferId: true } },
      },
    });

    if (
      !preflight ||
      (preflight.buyerId !== requesterId && preflight.sellerId !== requesterId)
    ) {
      throw new AppException(
        ErrorCode.ORDER_NOT_FOUND,
        'Order not found',
        HttpStatus.NOT_FOUND,
      );
    }

    const ack = await this.extensionTradeAckService.acknowledge({
      userId: requesterId,
      orderId,
      type,
      offerId: preflight.tradeOperation?.externalOfferId ?? null,
      idempotencyKey: `ack:${orderId}:${type}`,
    });

    const order = await this.getById(orderId, requesterId);
    return {
      ...ack,
      order,
    };
  }

  async listMyOrders(userId: string, query: ListMyOrdersQueryDto = {}) {
    const where: {
      OR?: Array<{ buyerId: string } | { sellerId: string }>;
      buyerId?: string;
      sellerId?: string;
      status?: OrderStatus;
    } = {};

    if (query.role === 'buyer') {
      where.buyerId = userId;
    } else if (query.role === 'seller') {
      where.sellerId = userId;
    } else {
      where.OR = [{ buyerId: userId }, { sellerId: userId }];
    }

    if (query.status) {
      where.status = query.status;
    }

    const orders = await this.prisma.order.findMany({
      where,
      include: {
        lot: {
          include: { inventoryAsset: { include: { itemDefinition: true } } },
        },
        tradeOperation: true,
        hold: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return toJsonSafe(orders);
  }

  async updateTradeReference(
    sellerId: string,
    orderId: string,
    dto: UpdateTradeReferenceDto,
    idempotencyKey?: string,
  ) {
    await this.tradeReferenceReconcileService.reconcile({
      orderId,
      sellerId,
      offerId: dto.offerId,
      tradeUrl: dto.tradeUrl,
      idempotencyKey,
      source: 'MANUAL',
      actorUserId: sellerId,
    });
    return this.getById(orderId, sellerId);
  }

  private resolveVerificationMode(): string {
    const config = getProvidersConfig();
    // Extension Guard flows create real Steam offers even when TRADE_PROVIDER=mock
    // (mock is only for admin complete buttons). Delivery must still be pollable.
    if (
      config.trade !== 'steam' &&
      process.env.ENABLE_EXTENSION_TASK_PIPELINE === 'true' &&
      process.env.ENABLE_DELIVERY_VERIFICATION_ENGINE === 'true'
    ) {
      return resolveOrderVerificationMode();
    }
    if (config.trade !== 'steam') {
      return 'MOCK';
    }
    return resolveOrderVerificationMode();
  }

  async cancel(buyerId: string, orderId: string, idempotencyKey: string) {
    if (!idempotencyKey) {
      throw new AppException(
        ErrorCode.IDEMPOTENCY_KEY_REQUIRED,
        'Idempotency-Key header is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    const existingAudit = await this.prisma.auditLog.findFirst({
      where: {
        idempotencyKey,
        action: 'ORDER_CANCELED',
        entityType: 'order',
        entityId: orderId,
      },
    });

    if (existingAudit) {
      return this.getById(orderId, buyerId);
    }

    const order = await this.prisma.$transaction(async (tx) => {
      const current = await tx.order.findUnique({
        where: { id: orderId },
        include: { hold: true, lot: true },
      });

      if (!current) {
        throw new AppException(
          ErrorCode.ORDER_NOT_FOUND,
          'Order not found',
          HttpStatus.NOT_FOUND,
        );
      }
      if (current.buyerId !== buyerId) {
        throw new AppException(
          ErrorCode.FORBIDDEN,
          'Only buyer can cancel this order',
          HttpStatus.FORBIDDEN,
        );
      }
      if (!this.orderStateService.isOpenStatus(current.status)) {
        throw new AppException(
          ErrorCode.BAD_REQUEST,
          'Order cannot be canceled in current status',
          HttpStatus.BAD_REQUEST,
        );
      }
      if (current.status === OrderStatus.TRADE_CONFIRMED) {
        throw new AppException(
          ErrorCode.BAD_REQUEST,
          'Order cannot be canceled after trade confirmation',
          HttpStatus.BAD_REQUEST,
        );
      }

      if (!current.hold) {
        throw new AppException(
          ErrorCode.BAD_REQUEST,
          'Order hold not found',
          HttpStatus.BAD_REQUEST,
        );
      }

      await this.ledgerService.refundHold({
        buyerUserId: buyerId,
        orderId: current.id,
        holdId: current.hold.id,
        amountMinor: current.hold.amountMinor,
        idempotencyKey: `order-cancel:${idempotencyKey}`,
        tx,
      });

      await this.orderStateService.transitionByEvent(tx, {
        orderId: current.id,
        from: current.status,
        event: 'CANCEL',
        actorUserId: buyerId,
        reason: 'buyer_canceled',
      });

      await this.lotStateService.transition(tx, {
        lotId: current.lotId,
        from: current.lot.status,
        to: LotStatus.ACTIVE,
        actorUserId: buyerId,
        extra: { reservedByUserId: null },
      });

      await tx.inventoryAsset.update({
        where: { id: current.lot.inventoryAssetId },
        data: { status: InventoryAssetStatus.LISTED },
      });

      await tx.tradeOperation.updateMany({
        where: { orderId: current.id },
        data: {
          status: TradeOperationStatus.FAILED_SAFE,
          failReasonCode: 'BUYER_CANCELED',
        },
      });

      const canceled = await tx.order.findUnique({
        where: { id: current.id },
        include: {
          lot: {
            include: { inventoryAsset: { include: { itemDefinition: true } } },
          },
          tradeOperation: true,
          hold: true,
        },
      });

      if (!canceled) {
        throw new AppException(
          ErrorCode.ORDER_NOT_FOUND,
          'Order not found after cancel',
          HttpStatus.NOT_FOUND,
        );
      }

      await tx.auditLog.create({
        data: {
          actorUserId: buyerId,
          entityType: 'order',
          entityId: canceled.id,
          action: 'ORDER_CANCELED',
          beforeState: { status: current.status },
          afterState: { status: OrderStatus.CANCELED },
          idempotencyKey,
          ...getAuditContext(),
        },
      });

      await tx.outboxEvent.create({
        data: {
          eventType: 'ORDER_FAILED',
          aggregateType: 'order',
          aggregateId: canceled.id,
          payload: { reason: 'buyer_canceled' },
        },
      });

      return canceled;
    });

    return toJsonSafe(order);
  }
}

function extractTradeTaskErrorMessage(
  event?: {
    payload: unknown;
  } | null,
): string | null {
  if (!event?.payload || typeof event.payload !== 'object') {
    return null;
  }
  const message = (event.payload as { message?: unknown }).message;
  return typeof message === 'string' && message.trim() ? message.trim() : null;
}

function extractTradeTaskMarketHashName(
  events: Array<{ phase: string; payload: unknown }>,
): string | null {
  for (const event of events) {
    if (event.phase !== 'ITEM_SELECTED' && event.phase !== 'OFFER_DRAFTED') {
      continue;
    }
    if (!event.payload || typeof event.payload !== 'object') {
      continue;
    }
    const marketHashName = (event.payload as { marketHashName?: unknown })
      .marketHashName;
    if (typeof marketHashName === 'string' && marketHashName.trim()) {
      return marketHashName.trim();
    }
  }
  return null;
}
