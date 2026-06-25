import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InventoryAssetStatus,
  LotStatus,
  OrderStatus,
  TradeOperationStatus,
} from '@prisma/client';
import { getAuditContext } from '../common/observability/audit-context';
import { toJsonSafe } from '../common/json-safe.util';
import { LotStateService } from '../lots/lot-state.service';
import { OrderStateService } from '../orders/order-state.service';
import { PrismaService } from '../prisma/prisma.service';
import { TRADE_PROVIDER } from '../providers/tokens';
import type { TradeProvider } from '../providers/trade/trade-provider.interface';
import { LedgerService } from '../wallet/ledger.service';
import { MockFailMode } from './dto/mock-fail.dto';

@Injectable()
export class TradesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerService: LedgerService,
    private readonly lotStateService: LotStateService,
    private readonly orderStateService: OrderStateService,
    @Inject(TRADE_PROVIDER) private readonly tradeProvider: TradeProvider,
  ) {}

  async mockSuccess(
    orderId: string,
    actorUserId: string,
    idempotencyKey: string,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required');
    }

    const existingAudit = await this.prisma.auditLog.findFirst({
      where: {
        entityType: 'order',
        entityId: orderId,
        action: 'TRADE_MOCK_SUCCESS',
        idempotencyKey,
      },
    });
    if (existingAudit) {
      return this.getOrderDetails(orderId);
    }

    const order = await this.prisma.$transaction(async (tx) => {
      const current = await tx.order.findUnique({
        where: { id: orderId },
        include: { hold: true, lot: true, tradeOperation: true },
      });

      if (!current || !current.hold || !current.tradeOperation) {
        throw new NotFoundException('Trade operation not found');
      }
      if (current.status !== OrderStatus.WAITING_TRADE) {
        throw new BadRequestException('Order is not in WAITING_TRADE status');
      }
      if (current.tradeOperation.status !== TradeOperationStatus.WAITING) {
        throw new BadRequestException(
          'Trade operation is not in WAITING status',
        );
      }

      const completion = await this.tradeProvider.completeTrade(
        current.id,
        'SUCCESS',
      );

      await tx.tradeOperation.update({
        where: { id: current.tradeOperation.id },
        data: {
          status: TradeOperationStatus.CONFIRMED,
          providerRef: completion.providerRef,
          failReasonCode: null,
        },
      });

      await this.orderStateService.transition(tx, {
        orderId: current.id,
        from: OrderStatus.WAITING_TRADE,
        to: OrderStatus.TRADE_CONFIRMED,
        actorUserId,
      });

      await this.ledgerService.settleSale({
        buyerUserId: current.buyerId,
        sellerUserId: current.sellerId,
        orderId: current.id,
        holdId: current.hold.id,
        totalAmountMinor: current.hold.amountMinor,
        sellerReceiveMinor: current.lot.sellerReceiveMinor,
        commissionMinor: current.lot.commissionMinor,
        idempotencyKey: `trade-success:${idempotencyKey}`,
        tx,
      });

      await tx.hold.update({
        where: { id: current.hold.id },
        data: {
          capturedMinor: current.hold.amountMinor,
        },
      });

      await this.orderStateService.transition(tx, {
        orderId: current.id,
        from: OrderStatus.TRADE_CONFIRMED,
        to: OrderStatus.COMPLETED,
        actorUserId,
      });

      await this.lotStateService.transition(tx, {
        lotId: current.lotId,
        from: current.lot.status,
        to: LotStatus.SOLD,
        actorUserId,
      });

      await tx.inventoryAsset.update({
        where: { id: current.lot.inventoryAssetId },
        data: { status: InventoryAssetStatus.SOLD },
      });

      const completed = await tx.order.findUnique({
        where: { id: current.id },
        include: {
          lot: {
            include: { inventoryAsset: { include: { itemDefinition: true } } },
          },
          hold: true,
          tradeOperation: true,
        },
      });

      if (!completed) {
        throw new NotFoundException('Order not found after completion');
      }

      await tx.auditLog.create({
        data: {
          actorUserId,
          entityType: 'order',
          entityId: current.id,
          action: 'TRADE_MOCK_SUCCESS',
          beforeState: {
            status: current.status,
            tradeStatus: current.tradeOperation.status,
          },
          afterState: {
            status: OrderStatus.COMPLETED,
            tradeStatus: TradeOperationStatus.CONFIRMED,
          },
          idempotencyKey,
          ...getAuditContext(),
        },
      });

      await tx.outboxEvent.create({
        data: {
          eventType: 'ORDER_COMPLETED',
          aggregateType: 'order',
          aggregateId: current.id,
          payload: { orderId: current.id },
        },
      });
      await tx.outboxEvent.create({
        data: {
          eventType: 'SALE_SETTLED',
          aggregateType: 'order',
          aggregateId: current.id,
          payload: { orderId: current.id },
        },
      });

      return completed;
    });

    return toJsonSafe(order);
  }

  async mockFail(
    orderId: string,
    actorUserId: string,
    idempotencyKey: string,
    mode: MockFailMode,
    reasonCode?: string,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required');
    }

    const existingAudit = await this.prisma.auditLog.findFirst({
      where: {
        entityType: 'order',
        entityId: orderId,
        action:
          mode === MockFailMode.SAFE
            ? 'TRADE_MOCK_FAIL_SAFE'
            : 'TRADE_MOCK_FAIL_DISPUTE',
        idempotencyKey,
      },
    });
    if (existingAudit) {
      return this.getOrderDetails(orderId);
    }

    const order = await this.prisma.$transaction(async (tx) => {
      const current = await tx.order.findUnique({
        where: { id: orderId },
        include: { hold: true, lot: true, tradeOperation: true },
      });

      if (!current || !current.hold || !current.tradeOperation) {
        throw new NotFoundException('Trade operation not found');
      }
      if (current.status !== OrderStatus.WAITING_TRADE) {
        throw new BadRequestException('Order is not in WAITING_TRADE status');
      }
      if (current.tradeOperation.status !== TradeOperationStatus.WAITING) {
        throw new BadRequestException(
          'Trade operation is not in WAITING status',
        );
      }

      const failTradeStatus =
        mode === MockFailMode.SAFE
          ? TradeOperationStatus.FAILED_SAFE
          : TradeOperationStatus.FAILED_DISPUTE;

      const completion = await this.tradeProvider.completeTrade(
        current.id,
        mode === MockFailMode.SAFE ? 'FAIL_SAFE' : 'FAIL_DISPUTE',
        { reasonCode },
      );

      await tx.tradeOperation.update({
        where: { id: current.tradeOperation.id },
        data: {
          status: failTradeStatus,
          providerRef: completion.providerRef,
          failReasonCode: completion.failReasonCode,
        },
      });

      if (mode === MockFailMode.SAFE) {
        await this.ledgerService.refundHold({
          buyerUserId: current.buyerId,
          orderId: current.id,
          holdId: current.hold.id,
          amountMinor: current.hold.amountMinor,
          idempotencyKey: `trade-fail-safe:${idempotencyKey}`,
          tx,
        });

        await tx.hold.update({
          where: { id: current.hold.id },
          data: {
            releasedMinor: current.hold.amountMinor,
          },
        });

        await this.orderStateService.transition(tx, {
          orderId: current.id,
          from: OrderStatus.WAITING_TRADE,
          to: OrderStatus.FAILED,
          actorUserId,
          reason: reasonCode ?? 'trade_fail_safe',
        });

        await this.lotStateService.transition(tx, {
          lotId: current.lotId,
          from: current.lot.status,
          to: LotStatus.ACTIVE,
          actorUserId,
          extra: { reservedByUserId: null },
        });

        await tx.inventoryAsset.update({
          where: { id: current.lot.inventoryAssetId },
          data: { status: InventoryAssetStatus.LISTED },
        });
      } else {
        await this.orderStateService.transition(tx, {
          orderId: current.id,
          from: OrderStatus.WAITING_TRADE,
          to: OrderStatus.DISPUTE,
          actorUserId,
          reason: reasonCode ?? 'trade_fail_dispute',
        });

        await this.lotStateService.transition(tx, {
          lotId: current.lotId,
          from: current.lot.status,
          to: LotStatus.BLOCKED,
          actorUserId,
        });

        await tx.inventoryAsset.update({
          where: { id: current.lot.inventoryAssetId },
          data: { status: InventoryAssetStatus.BLOCKED },
        });
      }

      const updated = await tx.order.findUnique({
        where: { id: current.id },
        include: {
          lot: {
            include: { inventoryAsset: { include: { itemDefinition: true } } },
          },
          hold: true,
          tradeOperation: true,
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId,
          entityType: 'order',
          entityId: current.id,
          action:
            mode === MockFailMode.SAFE
              ? 'TRADE_MOCK_FAIL_SAFE'
              : 'TRADE_MOCK_FAIL_DISPUTE',
          beforeState: {
            status: current.status,
            tradeStatus: current.tradeOperation.status,
          },
          afterState: {
            status:
              mode === MockFailMode.SAFE
                ? OrderStatus.FAILED
                : OrderStatus.DISPUTE,
            tradeStatus: failTradeStatus,
          },
          idempotencyKey,
          ...getAuditContext(),
        },
      });

      await tx.outboxEvent.create({
        data: {
          eventType:
            mode === MockFailMode.SAFE
              ? 'ORDER_FAILED'
              : 'ORDER_DISPUTE_OPENED',
          aggregateType: 'order',
          aggregateId: current.id,
          payload: {
            orderId: current.id,
            reasonCode: reasonCode ?? null,
            mode,
          },
        },
      });

      if (!updated) {
        throw new NotFoundException('Order not found after update');
      }

      return updated;
    });

    return toJsonSafe(order);
  }

  async mockTimeout(
    orderId: string,
    actorUserId: string,
    idempotencyKey: string,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required');
    }

    const existingAudit = await this.prisma.auditLog.findFirst({
      where: {
        entityType: 'order',
        entityId: orderId,
        action: 'TRADE_MOCK_TIMEOUT',
        idempotencyKey,
      },
    });
    if (existingAudit) {
      return this.getOrderDetails(orderId);
    }

    const order = await this.prisma.$transaction(async (tx) => {
      const current = await tx.order.findUnique({
        where: { id: orderId },
        include: { hold: true, lot: true, tradeOperation: true },
      });

      if (!current || !current.tradeOperation) {
        throw new NotFoundException('Trade operation not found');
      }
      if (current.status !== OrderStatus.WAITING_TRADE) {
        throw new BadRequestException('Order is not in WAITING_TRADE status');
      }
      if (current.tradeOperation.status !== TradeOperationStatus.WAITING) {
        throw new BadRequestException(
          'Trade operation is not in WAITING status',
        );
      }

      const completion = await this.tradeProvider.completeTrade(
        current.id,
        'TIMEOUT',
      );

      await tx.tradeOperation.update({
        where: { id: current.tradeOperation.id },
        data: {
          status: TradeOperationStatus.TIMEOUT,
          providerRef: completion.providerRef,
          failReasonCode: completion.failReasonCode,
        },
      });

      await this.orderStateService.transition(tx, {
        orderId: current.id,
        from: OrderStatus.WAITING_TRADE,
        to: OrderStatus.DISPUTE,
        actorUserId,
        reason: 'TRADE_TIMEOUT',
      });

      await this.lotStateService.transition(tx, {
        lotId: current.lotId,
        from: current.lot.status,
        to: LotStatus.BLOCKED,
        actorUserId,
      });

      await tx.inventoryAsset.update({
        where: { id: current.lot.inventoryAssetId },
        data: { status: InventoryAssetStatus.BLOCKED },
      });

      const updated = await tx.order.findUnique({
        where: { id: current.id },
        include: {
          lot: {
            include: { inventoryAsset: { include: { itemDefinition: true } } },
          },
          hold: true,
          tradeOperation: true,
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId,
          entityType: 'order',
          entityId: current.id,
          action: 'TRADE_MOCK_TIMEOUT',
          beforeState: {
            status: current.status,
            tradeStatus: current.tradeOperation.status,
          },
          afterState: {
            status: OrderStatus.DISPUTE,
            tradeStatus: TradeOperationStatus.TIMEOUT,
          },
          idempotencyKey,
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
            reasonCode: 'TRADE_TIMEOUT',
          },
        },
      });

      if (!updated) {
        throw new NotFoundException('Order not found after update');
      }

      return updated;
    });

    return toJsonSafe(order);
  }

  async getTradeById(tradeId: string) {
    const trade = await this.prisma.tradeOperation.findUnique({
      where: { id: tradeId },
      include: {
        order: {
          include: {
            lot: {
              include: {
                inventoryAsset: { include: { itemDefinition: true } },
              },
            },
            hold: true,
          },
        },
      },
    });

    if (!trade) {
      throw new NotFoundException('Trade operation not found');
    }

    return toJsonSafe(trade);
  }

  private async getOrderDetails(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        lot: {
          include: { inventoryAsset: { include: { itemDefinition: true } } },
        },
        hold: true,
        tradeOperation: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return toJsonSafe(order);
  }
}
