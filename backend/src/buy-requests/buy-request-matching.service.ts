import { Injectable, Logger } from '@nestjs/common';
import { BuyRequestStatus, LotStatus } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  lotMatchesBuyRequestPrice,
  shouldNotifyBuyRequestMatch,
} from './buy-request-matching.util';

@Injectable()
export class BuyRequestMatchingService {
  private readonly logger = new Logger(BuyRequestMatchingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async matchLotActivated(lotId: string): Promise<void> {
    const lot = await this.loadActiveLot(lotId);
    if (!lot) {
      return;
    }

    const buyRequests = await this.prisma.buyRequest.findMany({
      where: {
        itemDefinitionId: lot.itemDefinitionId,
        status: BuyRequestStatus.OPEN,
      },
    });

    for (const buyRequest of buyRequests) {
      await this.tryNotifyMatch(buyRequest, lot);
    }
  }

  async matchBuyRequestCreated(buyRequestId: string): Promise<void> {
    const buyRequest = await this.prisma.buyRequest.findUnique({
      where: { id: buyRequestId },
    });
    if (!buyRequest || buyRequest.status !== BuyRequestStatus.OPEN) {
      return;
    }

    const lots = await this.prisma.lot.findMany({
      where: {
        status: LotStatus.ACTIVE,
        inventoryAsset: { itemDefinitionId: buyRequest.itemDefinitionId },
      },
      orderBy: { priceMinor: 'asc' },
      select: {
        id: true,
        sellerId: true,
        priceMinor: true,
        inventoryAsset: { select: { itemDefinitionId: true } },
      },
    });

    for (const lot of lots) {
      const notified = await this.tryNotifyMatch(buyRequest, {
        id: lot.id,
        sellerId: lot.sellerId,
        priceMinor: lot.priceMinor,
        itemDefinitionId: lot.inventoryAsset.itemDefinitionId,
      });
      if (notified) {
        break;
      }
    }
  }

  async fulfillForPurchase(
    buyerId: string,
    itemDefinitionId: string,
  ): Promise<void> {
    await this.prisma.buyRequest.updateMany({
      where: {
        buyerId,
        itemDefinitionId,
        status: BuyRequestStatus.OPEN,
      },
      data: { status: BuyRequestStatus.FULFILLED },
    });
  }

  private async loadActiveLot(lotId: string) {
    const lot = await this.prisma.lot.findUnique({
      where: { id: lotId },
      select: {
        id: true,
        sellerId: true,
        priceMinor: true,
        status: true,
        inventoryAsset: { select: { itemDefinitionId: true } },
      },
    });
    if (!lot || lot.status !== LotStatus.ACTIVE) {
      return null;
    }
    return {
      id: lot.id,
      sellerId: lot.sellerId,
      priceMinor: lot.priceMinor,
      itemDefinitionId: lot.inventoryAsset.itemDefinitionId,
    };
  }

  private async tryNotifyMatch(
    buyRequest: {
      id: string;
      buyerId: string;
      maxPriceMinor: bigint | null;
      lastNotifiedLotId: string | null;
      lastNotifiedPriceMinor: bigint | null;
    },
    lot: {
      id: string;
      sellerId: string;
      priceMinor: bigint;
      itemDefinitionId: string;
    },
  ): Promise<boolean> {
    if (
      !shouldNotifyBuyRequestMatch(
        {
          id: buyRequest.id,
          buyerId: buyRequest.buyerId,
          maxPriceMinor: buyRequest.maxPriceMinor,
          lastNotifiedLotId: buyRequest.lastNotifiedLotId,
          lastNotifiedPriceMinor: buyRequest.lastNotifiedPriceMinor,
        },
        lot,
      )
    ) {
      return false;
    }

    const item = await this.prisma.itemDefinition.findUnique({
      where: { id: lot.itemDefinitionId },
      select: { marketHashName: true },
    });
    if (!item) {
      return false;
    }

    try {
      await this.notificationsService.notifyBuyRequestMatched({
        userId: buyRequest.buyerId,
        buyRequestId: buyRequest.id,
        lotId: lot.id,
        itemDefinitionId: lot.itemDefinitionId,
        marketHashName: item.marketHashName,
        priceMinor: lot.priceMinor.toString(),
      });

      await this.prisma.buyRequest.update({
        where: { id: buyRequest.id },
        data: {
          lastNotifiedLotId: lot.id,
          lastNotifiedPriceMinor: lot.priceMinor,
        },
      });
      return true;
    } catch (error) {
      this.logger.warn(
        `Failed to notify buy request ${buyRequest.id} for lot ${lot.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
  }
}

export { lotMatchesBuyRequestPrice };
