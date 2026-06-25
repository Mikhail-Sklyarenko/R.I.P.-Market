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
import { getAuditContext } from '../common/observability/audit-context';
import { LotStateService } from '../lots/lot-state.service';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from '../wallet/ledger.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderStateService } from './order-state.service';

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
  ) {}

  async create(buyerId: string, dto: CreateOrderDto, idempotencyKey: string) {
    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required');
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
      throw new NotFoundException('Buyer not found');
    }
    if (buyer.status !== UserStatus.ACTIVE) {
      throw new BadRequestException('Buyer is not ACTIVE');
    }

    const order = await this.prisma.$transaction(async (tx) => {
      const lockedLots = await tx.$queryRaw<LockedLotRow[]>`
        SELECT id, "sellerId", "inventoryAssetId", status, "priceMinor", "commissionMinor", "sellerReceiveMinor"
        FROM "Lot"
        WHERE id = ${dto.lotId}
        FOR UPDATE
      `;

      const lot = lockedLots[0];
      if (!lot) {
        throw new NotFoundException('Lot not found');
      }
      if (lot.status !== LotStatus.ACTIVE) {
        throw new BadRequestException('Lot is not active');
      }
      if (lot.sellerId === buyerId) {
        throw new BadRequestException('Buyer cannot purchase own lot');
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
        throw new BadRequestException('Lot already has an open order');
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

      await this.orderStateService.recordCreated(tx, createdOrder.id, buyerId);

      await this.orderStateService.transition(tx, {
        orderId: createdOrder.id,
        from: OrderStatus.CREATED,
        to: OrderStatus.PAYMENT_RESERVED,
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

      await tx.tradeOperation.create({
        data: {
          orderId: createdOrder.id,
          status: TradeOperationStatus.WAITING,
        },
      });

      await this.orderStateService.transition(tx, {
        orderId: createdOrder.id,
        from: OrderStatus.PAYMENT_RESERVED,
        to: OrderStatus.WAITING_TRADE,
        actorUserId: buyerId,
      });

      const waitingOrder = await tx.order.findUnique({
        where: { id: createdOrder.id },
        include: {
          lot: {
            include: { inventoryAsset: { include: { itemDefinition: true } } },
          },
          tradeOperation: true,
          hold: true,
        },
      });

      if (!waitingOrder) {
        throw new NotFoundException('Order not found after creation');
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

    return toJsonSafe(order);
  }

  async getById(orderId: string, requesterId?: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        lot: {
          include: { inventoryAsset: { include: { itemDefinition: true } } },
        },
        tradeOperation: true,
        hold: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (
      requesterId &&
      order.buyerId !== requesterId &&
      order.sellerId !== requesterId
    ) {
      throw new NotFoundException('Order not found');
    }

    return toJsonSafe(order);
  }

  async listMyOrders(userId: string) {
    const orders = await this.prisma.order.findMany({
      where: {
        OR: [{ buyerId: userId }, { sellerId: userId }],
      },
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

  async cancel(buyerId: string, orderId: string, idempotencyKey: string) {
    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required');
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
        throw new NotFoundException('Order not found');
      }
      if (current.buyerId !== buyerId) {
        throw new BadRequestException('Only buyer can cancel this order');
      }
      if (!this.orderStateService.isOpenStatus(current.status)) {
        throw new BadRequestException(
          'Order cannot be canceled in current status',
        );
      }
      if (current.status === OrderStatus.TRADE_CONFIRMED) {
        throw new BadRequestException(
          'Order cannot be canceled after trade confirmation',
        );
      }

      if (!current.hold) {
        throw new BadRequestException('Order hold not found');
      }

      await this.ledgerService.refundHold({
        buyerUserId: buyerId,
        orderId: current.id,
        holdId: current.hold.id,
        amountMinor: current.hold.amountMinor,
        idempotencyKey: `order-cancel:${idempotencyKey}`,
        tx,
      });

      await this.orderStateService.transition(tx, {
        orderId: current.id,
        from: current.status,
        to: OrderStatus.CANCELED,
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
        throw new NotFoundException('Order not found after cancel');
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
