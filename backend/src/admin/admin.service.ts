import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InventoryAssetStatus,
  LotStatus,
  OrderStatus,
  TradeOperationStatus,
  UserStatus,
} from '@prisma/client';
import { toJsonSafe } from '../common/json-safe.util';
import { LotStateService } from '../lots/lot-state.service';
import { OrderStateService } from '../orders/order-state.service';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from '../wallet/ledger.service';
import { TradesService } from '../trades/trades.service';
import { TradeShadowComparatorService } from '../trades/trade-shadow-comparator.service';
import { DisputeResolution } from './dto/resolve-dispute.dto';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerService: LedgerService,
    private readonly lotStateService: LotStateService,
    private readonly orderStateService: OrderStateService,
    private readonly tradesService: TradesService,
    private readonly shadowComparator: TradeShadowComparatorService,
  ) {}

  async listUsers() {
    const users = await this.prisma.user.findMany({
      include: {
        wallet: { include: { accounts: true } },
        _count: {
          select: {
            lots: true,
            buyOrders: true,
            sellOrders: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return toJsonSafe(users);
  }

  async updateUserStatus(
    userId: string,
    status: UserStatus,
    actorUserId: string,
    reason?: string,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { status },
      include: {
        wallet: { include: { accounts: true } },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorUserId,
        entityType: 'user',
        entityId: userId,
        action: 'USER_STATUS_UPDATED',
        reason,
        beforeState: { status: user.status },
        afterState: { status },
      },
    });

    return toJsonSafe(updated);
  }

  async listOrders() {
    const orders = await this.prisma.order.findMany({
      include: {
        buyer: {
          select: { id: true, username: true, role: true, status: true },
        },
        seller: {
          select: { id: true, username: true, role: true, status: true },
        },
        lot: {
          include: {
            inventoryAsset: { include: { itemDefinition: true } },
          },
        },
        tradeOperation: true,
        hold: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return toJsonSafe(orders);
  }

  async getOrderCard(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        buyer: {
          include: {
            wallet: { include: { accounts: true } },
          },
        },
        seller: {
          include: {
            wallet: { include: { accounts: true } },
          },
        },
        lot: {
          include: {
            inventoryAsset: { include: { itemDefinition: true } },
          },
        },
        tradeOperation: true,
        hold: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const buyerWalletId = order.buyer.wallet?.id;
    const sellerWalletId = order.seller.wallet?.id;

    const ledgerEntries = await this.prisma.ledgerEntry.findMany({
      where: {
        OR: [
          { orderId },
          ...(buyerWalletId ? [{ walletId: buyerWalletId, orderId }] : []),
          ...(sellerWalletId ? [{ walletId: sellerWalletId, orderId }] : []),
        ],
      },
      orderBy: { createdAt: 'asc' },
    });

    const auditLogs = await this.prisma.auditLog.findMany({
      where: {
        OR: [
          { entityType: 'order', entityId: orderId },
          {
            entityType: 'user',
            entityId: { in: [order.buyerId, order.sellerId] },
          },
          {
            entityType: 'wallet',
            entityId: {
              in: [buyerWalletId, sellerWalletId].filter(Boolean) as string[],
            },
          },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });

    const outboxEvents = await this.prisma.outboxEvent.findMany({
      where: { aggregateType: 'order', aggregateId: orderId },
      orderBy: { createdAt: 'asc' },
    });

    const orderStatusEvents = await this.prisma.orderStatusEvent.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
    });

    const lotStatusEvents = await this.prisma.lotStatusEvent.findMany({
      where: { lotId: order.lotId },
      orderBy: { createdAt: 'asc' },
    });

    const tradePollEvents = order.tradeOperation
      ? await this.prisma.tradePollEvent.findMany({
          where: { tradeOperationId: order.tradeOperation.id },
          orderBy: { checkedAt: 'desc' },
          take: 50,
        })
      : [];

    const verificationSnapshots =
      await this.shadowComparator.listSnapshots(orderId);

    return toJsonSafe({
      order,
      ledgerEntries,
      auditLogs,
      outboxEvents,
      orderStatusEvents,
      lotStatusEvents,
      tradePollEvents,
      verificationSnapshots,
    });
  }

  async applyObservedStatus(
    orderId: string,
    actorUserId: string,
    idempotencyKey: string,
  ) {
    await this.tradesService.applyObservedStatus(
      orderId,
      actorUserId,
      idempotencyKey,
    );
    return this.getOrderCard(orderId);
  }

  async getShadowDashboard() {
    const mismatchesLast7d =
      await this.shadowComparator.countMismatchesLast7Days();
    return { mismatchesLast7d };
  }

  async listOrderStatusEvents(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const events = await this.prisma.orderStatusEvent.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
    });

    return toJsonSafe(events);
  }

  async listLotStatusEvents(lotId: string) {
    const lot = await this.prisma.lot.findUnique({
      where: { id: lotId },
      select: { id: true },
    });
    if (!lot) {
      throw new NotFoundException('Lot not found');
    }

    const events = await this.prisma.lotStatusEvent.findMany({
      where: { lotId },
      orderBy: { createdAt: 'asc' },
    });

    return toJsonSafe(events);
  }

  async openDispute(
    orderId: string,
    actorUserId: string,
    reason: string,
    idempotencyKey: string,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required');
    }

    const existing = await this.prisma.auditLog.findFirst({
      where: {
        entityType: 'order',
        entityId: orderId,
        action: 'ADMIN_DISPUTE_OPENED',
        idempotencyKey,
      },
    });
    if (existing) {
      return this.getOrderCard(orderId);
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const current = await tx.order.findUnique({
        where: { id: orderId },
        include: { lot: true, tradeOperation: true },
      });

      if (!current) {
        throw new NotFoundException('Order not found');
      }
      if (current.status === OrderStatus.DISPUTE) {
        return current;
      }
      if (!this.orderStateService.isOpenStatus(current.status)) {
        throw new BadRequestException(
          'Order cannot be moved to dispute from current status',
        );
      }

      await this.orderStateService.transition(tx, {
        orderId,
        from: current.status,
        to: OrderStatus.DISPUTE,
        actorUserId,
        reason,
      });

      if (current.tradeOperation) {
        await tx.tradeOperation.update({
          where: { id: current.tradeOperation.id },
          data: {
            status: TradeOperationStatus.FAILED_DISPUTE,
            failReasonCode: 'ADMIN_DISPUTE',
          },
        });
      }

      await this.lotStateService.transition(tx, {
        lotId: current.lotId,
        from: current.lot.status,
        to: LotStatus.BLOCKED,
        actorUserId,
        reason,
      });

      await tx.inventoryAsset.update({
        where: { id: current.lot.inventoryAssetId },
        data: { status: InventoryAssetStatus.BLOCKED },
      });

      await tx.auditLog.create({
        data: {
          actorUserId,
          entityType: 'order',
          entityId: orderId,
          action: 'ADMIN_DISPUTE_OPENED',
          reason,
          beforeState: { status: current.status },
          afterState: { status: OrderStatus.DISPUTE },
          idempotencyKey,
        },
      });

      await tx.outboxEvent.create({
        data: {
          eventType: 'ORDER_DISPUTE_OPENED',
          aggregateType: 'order',
          aggregateId: orderId,
          payload: { reason, openedBy: 'admin' },
        },
      });

      return current;
    });

    return this.getOrderCard(result.id);
  }

  async resolveDispute(
    orderId: string,
    actorUserId: string,
    resolution: DisputeResolution,
    reason: string,
    idempotencyKey: string,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required');
    }

    const existing = await this.prisma.auditLog.findFirst({
      where: {
        entityType: 'order',
        entityId: orderId,
        action: 'ADMIN_DISPUTE_RESOLVED',
        idempotencyKey,
      },
    });
    if (existing) {
      return this.getOrderCard(orderId);
    }

    await this.prisma.$transaction(async (tx) => {
      const current = await tx.order.findUnique({
        where: { id: orderId },
        include: { hold: true, lot: true, tradeOperation: true },
      });

      if (!current) {
        throw new NotFoundException('Order not found');
      }
      if (current.status !== OrderStatus.DISPUTE) {
        throw new BadRequestException('Order is not in DISPUTE status');
      }
      if (!current.hold) {
        throw new BadRequestException('Order hold not found');
      }

      if (resolution === DisputeResolution.BUYER) {
        await this.ledgerService.refundHold({
          buyerUserId: current.buyerId,
          orderId: current.id,
          holdId: current.hold.id,
          amountMinor: current.hold.amountMinor,
          idempotencyKey: `admin-resolve-buyer:${idempotencyKey}`,
          tx,
        });

        await tx.hold.update({
          where: { id: current.hold.id },
          data: { releasedMinor: current.hold.amountMinor },
        });

        await this.orderStateService.transition(tx, {
          orderId: current.id,
          from: OrderStatus.DISPUTE,
          to: OrderStatus.FAILED,
          actorUserId,
          reason,
        });

        await this.lotStateService.transition(tx, {
          lotId: current.lotId,
          from: current.lot.status,
          to: LotStatus.ACTIVE,
          actorUserId,
          reason,
          extra: { reservedByUserId: null },
        });

        await tx.inventoryAsset.update({
          where: { id: current.lot.inventoryAssetId },
          data: { status: InventoryAssetStatus.LISTED },
        });
      } else {
        if (current.tradeOperation) {
          await tx.tradeOperation.update({
            where: { id: current.tradeOperation.id },
            data: {
              status: TradeOperationStatus.CONFIRMED,
              failReasonCode: null,
              providerRef: `admin-resolve-seller-${current.id}`,
            },
          });
        }

        await this.ledgerService.settleSale({
          buyerUserId: current.buyerId,
          sellerUserId: current.sellerId,
          orderId: current.id,
          holdId: current.hold.id,
          totalAmountMinor: current.hold.amountMinor,
          sellerReceiveMinor: current.lot.sellerReceiveMinor,
          commissionMinor: current.lot.commissionMinor,
          idempotencyKey: `admin-resolve-seller:${idempotencyKey}`,
          tx,
        });

        await tx.hold.update({
          where: { id: current.hold.id },
          data: { capturedMinor: current.hold.amountMinor },
        });

        await this.orderStateService.transition(tx, {
          orderId: current.id,
          from: OrderStatus.DISPUTE,
          to: OrderStatus.COMPLETED,
          actorUserId,
          reason,
        });

        await this.lotStateService.transition(tx, {
          lotId: current.lotId,
          from: current.lot.status,
          to: LotStatus.SOLD,
          actorUserId,
          reason,
        });

        await tx.inventoryAsset.update({
          where: { id: current.lot.inventoryAssetId },
          data: { status: InventoryAssetStatus.SOLD },
        });
      }

      await tx.auditLog.create({
        data: {
          actorUserId,
          entityType: 'order',
          entityId: orderId,
          action: 'ADMIN_DISPUTE_RESOLVED',
          reason,
          beforeState: { status: OrderStatus.DISPUTE },
          afterState: {
            status:
              resolution === DisputeResolution.BUYER
                ? OrderStatus.FAILED
                : OrderStatus.COMPLETED,
            resolution,
          },
          idempotencyKey,
        },
      });

      await tx.outboxEvent.create({
        data: {
          eventType:
            resolution === DisputeResolution.BUYER
              ? 'ORDER_FAILED'
              : 'ORDER_COMPLETED',
          aggregateType: 'order',
          aggregateId: orderId,
          payload: { resolution, reason, resolvedBy: 'admin' },
        },
      });

      if (resolution === DisputeResolution.SELLER) {
        await tx.outboxEvent.create({
          data: {
            eventType: 'SALE_SETTLED',
            aggregateType: 'order',
            aggregateId: orderId,
            payload: { resolvedBy: 'admin' },
          },
        });
      }
    });

    return this.getOrderCard(orderId);
  }

  async listAuditLogs(entityType?: string, entityId?: string) {
    const logs = await this.prisma.auditLog.findMany({
      where: {
        ...(entityType ? { entityType } : {}),
        ...(entityId ? { entityId } : {}),
      },
      include: {
        actorUser: { select: { id: true, username: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    return toJsonSafe(logs);
  }

  async listOutboxEvents(status?: string) {
    const events = await this.prisma.outboxEvent.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    return toJsonSafe(events);
  }

  async retryOutboxEvent(eventId: string, actorUserId: string) {
    const event = await this.prisma.outboxEvent.findUnique({
      where: { id: eventId },
    });
    if (!event) {
      throw new NotFoundException('Outbox event not found');
    }

    const updated = await this.prisma.outboxEvent.update({
      where: { id: eventId },
      data: {
        status: 'PENDING',
        retryCount: { increment: 1 },
        nextRetryAt: null,
        processedAt: null,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorUserId,
        entityType: 'outbox_event',
        entityId: eventId,
        action: 'OUTBOX_RETRY',
        afterState: { status: 'PENDING' },
      },
    });

    return toJsonSafe(updated);
  }
}
