import { HttpStatus, Injectable } from '@nestjs/common';
import { BuyRequestStatus, LotStatus, Prisma } from '@prisma/client';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { toJsonSafe } from '../common/json-safe.util';
import { PrismaService } from '../prisma/prisma.service';
import { resolveOrderBookItemScope } from './order-book-item-scope.util';
import {
  aggregateBidLevels,
  AskPreviewRow,
  buildOrderBookSnapshot,
} from './order-book.util';

const ASK_PREVIEW_LIMIT = 8;

function toFloatNumber(
  value: { toString(): string } | number | null | undefined,
): number | null {
  if (value == null) {
    return null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  const parsed = Number.parseFloat(value.toString());
  return Number.isFinite(parsed) ? parsed : null;
}

@Injectable()
export class OrderBookService {
  constructor(private readonly prisma: PrismaService) {}

  async getForItem(itemRef: string, wear?: string) {
    const scope = await resolveOrderBookItemScope(this.prisma, itemRef, wear);
    if (!scope) {
      throw new AppException(
        ErrorCode.NOT_FOUND,
        'Item not found',
        HttpStatus.NOT_FOUND,
      );
    }

    const lotWhere = this.buildActiveLotsWhere(scope);
    const [openBuyRequests, askCount, minAskLot, askLots] = await Promise.all([
      this.prisma.buyRequest.findMany({
        where: {
          status: BuyRequestStatus.OPEN,
          itemDefinitionId: { in: scope.itemDefinitionIds },
          maxPriceMinor: { not: null },
        },
        select: {
          maxPriceMinor: true,
          quantity: true,
          quantityFilled: true,
        },
      }),
      this.prisma.lot.count({ where: lotWhere }),
      this.prisma.lot.findFirst({
        where: lotWhere,
        orderBy: { priceMinor: 'asc' },
        select: { priceMinor: true },
      }),
      this.prisma.lot.findMany({
        where: lotWhere,
        orderBy: { priceMinor: 'asc' },
        take: ASK_PREVIEW_LIMIT,
        select: {
          id: true,
          priceMinor: true,
          listingSnapshot: {
            select: { floatValue: true, wear: true },
          },
          inventoryAsset: {
            select: { floatValue: true, wear: true },
          },
        },
      }),
    ]);

    const bids = aggregateBidLevels(openBuyRequests);
    const asks: AskPreviewRow[] = askLots.map((lot) => ({
      lotId: lot.id,
      priceMinor: lot.priceMinor.toString(),
      floatValue: toFloatNumber(
        lot.listingSnapshot?.floatValue ?? lot.inventoryAsset.floatValue,
      ),
      wear: lot.listingSnapshot?.wear ?? lot.inventoryAsset.wear,
    }));

    const snapshot = buildOrderBookSnapshot({
      bids,
      asks,
      asksCount: askCount,
      minAskPriceMinor: minAskLot?.priceMinor ?? null,
    });

    return toJsonSafe({
      itemDefinitionId: scope.catalogItem.id,
      wear: scope.wear,
      ...snapshot,
    });
  }

  private buildActiveLotsWhere(
    scope: Awaited<ReturnType<typeof resolveOrderBookItemScope>>,
  ): Prisma.LotWhereInput {
    const where: Prisma.LotWhereInput = {
      status: LotStatus.ACTIVE,
    };

    const inventoryAssetFilter: Prisma.InventoryAssetWhereInput = {};

    if (scope!.wear) {
      inventoryAssetFilter.itemDefinitionId = { in: scope!.itemDefinitionIds };
      inventoryAssetFilter.wear = {
        equals: scope!.wear,
        mode: 'insensitive',
      };
    } else if (scope!.catalogItem.catalogSeeded && scope!.baseMarketHashName) {
      inventoryAssetFilter.itemDefinition = {
        OR: [
          { baseMarketHashName: scope!.baseMarketHashName },
          { marketHashName: scope!.baseMarketHashName },
          { id: { in: scope!.itemDefinitionIds } },
        ],
      };
    } else {
      inventoryAssetFilter.itemDefinitionId = { in: scope!.itemDefinitionIds };
    }

    where.inventoryAsset = inventoryAssetFilter;
    return where;
  }
}
