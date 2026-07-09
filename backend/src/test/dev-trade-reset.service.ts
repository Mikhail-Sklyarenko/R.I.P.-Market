import { Injectable, Logger } from '@nestjs/common';
import {
  InventoryAssetStatus,
  LotStatus,
  OrderStatus,
  TradeOperationStatus,
  TradeTaskStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OrderStateService } from '../orders/order-state.service';
import { LedgerService } from '../wallet/ledger.service';

const OPEN_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.CREATED,
  OrderStatus.PAYMENT_RESERVED,
  OrderStatus.WAITING_TRADE,
];

export type DevTradeResetResult = {
  ok: true;
  canceledOrders: number;
  canceledLots: number;
  resetAssets: number;
  expiredTasks: number;
};

@Injectable()
export class DevTradeResetService {
  private readonly logger = new Logger(DevTradeResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerService: LedgerService,
    private readonly orderStateService: OrderStateService,
  ) {}

  async resetForSeller(sellerId: string): Promise<DevTradeResetResult> {
    let canceledOrders = 0;
    let canceledLots = 0;
    let resetAssets = 0;
    let expiredTasks = 0;

    const openOrders = await this.prisma.order.findMany({
      where: {
        sellerId,
        status: { in: OPEN_ORDER_STATUSES },
      },
      include: { hold: true, lot: true },
    });

    for (const order of openOrders) {
      await this.prisma.$transaction(async (tx) => {
        const current = await tx.order.findUnique({
          where: { id: order.id },
          include: { hold: true, lot: true },
        });
        if (!current || !OPEN_ORDER_STATUSES.includes(current.status)) {
          return;
        }
        if (!current.hold) {
          throw new Error(`Order ${current.id} has no hold`);
        }

        const unreleased =
          current.hold.amountMinor - (current.hold.releasedMinor ?? 0n);
        if (unreleased > 0n) {
          await this.ledgerService.refundHold({
            buyerUserId: current.buyerId,
            orderId: current.id,
            holdId: current.hold.id,
            amountMinor: unreleased,
            idempotencyKey: `dev-reset:${sellerId}:${current.id}`,
            tx,
          });
          await tx.hold.update({
            where: { id: current.hold.id },
            data: { releasedMinor: current.hold.amountMinor },
          });
        }

        await this.orderStateService.transitionByEvent(tx, {
          orderId: current.id,
          from: current.status,
          event: 'CANCEL',
          actorUserId: sellerId,
          reason: 'dev_reset',
        });

        await tx.tradeOperation.updateMany({
          where: { orderId: current.id },
          data: {
            status: TradeOperationStatus.FAILED_SAFE,
            failReasonCode: 'DEV_RESET',
          },
        });
      });
      canceledOrders += 1;
    }

    const lotResult = await this.prisma.lot.updateMany({
      where: {
        sellerId,
        status: { in: [LotStatus.ACTIVE, LotStatus.RESERVED] },
      },
      data: { status: LotStatus.CANCELED },
    });
    canceledLots = lotResult.count;

    const assetResult = await this.prisma.inventoryAsset.updateMany({
      where: {
        ownerId: sellerId,
        status: {
          in: [
            InventoryAssetStatus.SOLD,
            InventoryAssetStatus.LISTED,
            InventoryAssetStatus.RESERVED,
            InventoryAssetStatus.BLOCKED,
          ],
        },
      },
      data: { status: InventoryAssetStatus.AVAILABLE },
    });
    resetAssets = assetResult.count;

    const taskResult = await this.prisma.tradeTask.updateMany({
      where: {
        order: { sellerId },
        status: {
          in: [
            TradeTaskStatus.CREATED,
            TradeTaskStatus.DISPATCHED,
            TradeTaskStatus.ACKED,
          ],
        },
      },
      data: { status: TradeTaskStatus.EXPIRED },
    });
    expiredTasks = taskResult.count;

    this.logger.log(
      JSON.stringify({
        event: 'dev_trade_reset',
        sellerId,
        canceledOrders,
        canceledLots,
        resetAssets,
        expiredTasks,
      }),
    );

    return {
      ok: true,
      canceledOrders,
      canceledLots,
      resetAssets,
      expiredTasks,
    };
  }
}
