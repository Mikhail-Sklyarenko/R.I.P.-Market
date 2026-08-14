import { HttpStatus, Injectable } from '@nestjs/common';
import { BuyRequestStatus, UserStatus } from '@prisma/client';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { toJsonSafe } from '../common/json-safe.util';
import {
  buildMarketHashNameWithWear,
  deriveBaseMarketHashName,
} from '../item-definitions/base-market-hash-name.util';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from '../wallet/ledger.service';
import { MAX_BUY_REQUEST_QUANTITY } from './buy-request.constants';
import { BuyRequestMatchingService } from './buy-request-matching.service';
import { CreateBuyRequestDto } from './dto/create-buy-request.dto';
import { isUuid, slugifyMarketHashName } from '../item-definitions/item-slug.util';

function parseAvailableWears(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === 'string');
}

@Injectable()
export class BuyRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly buyRequestMatching: BuyRequestMatchingService,
    private readonly ledger: LedgerService,
  ) {}

  async create(buyerId: string, itemDefinitionId: string, dto: CreateBuyRequestDto) {
    const buyer = await this.prisma.user.findUnique({ where: { id: buyerId } });
    if (!buyer || buyer.status !== UserStatus.ACTIVE) {
      throw new AppException(
        ErrorCode.BUYER_NOT_ACTIVE,
        'Buyer account is not active',
        HttpStatus.FORBIDDEN,
      );
    }

    const catalogItem = await this.findItemDefinition(itemDefinitionId);
    if (!catalogItem) {
      throw new AppException(
        ErrorCode.NOT_FOUND,
        'Item not found',
        HttpStatus.NOT_FOUND,
      );
    }

    const item = await this.resolveTargetItemDefinition(catalogItem, dto.wear);
    const quantity = dto.quantity ?? 1;
    if (quantity < 1 || quantity > MAX_BUY_REQUEST_QUANTITY) {
      throw new AppException(
        ErrorCode.VALIDATION_ERROR,
        `Quantity must be between 1 and ${MAX_BUY_REQUEST_QUANTITY}`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const maxPriceMinor = BigInt(dto.maxPriceMinor);
    const reservedAmountMinor = maxPriceMinor * BigInt(quantity);

    const existingOpen = await this.prisma.buyRequest.findFirst({
      where: {
        buyerId,
        itemDefinitionId: item.id,
        status: BuyRequestStatus.OPEN,
        maxPriceMinor,
      },
    });
    if (existingOpen) {
      throw new AppException(
        ErrorCode.BUY_REQUEST_ALREADY_OPEN,
        'You already have an open buy request at this price for this item',
        HttpStatus.BAD_REQUEST,
        { buyRequestId: existingOpen.id },
      );
    }

    let buyRequestId: string;
    try {
      buyRequestId = await this.prisma.$transaction(async (tx) => {
        const buyRequest = await tx.buyRequest.create({
          data: {
            buyerId,
            itemDefinitionId: item.id,
            maxPriceMinor,
            quantity,
            quantityFilled: 0,
            reservedAmountMinor,
          },
        });

        await this.ledger.reserveBuyRequestHold({
          buyerUserId: buyerId,
          buyRequestId: buyRequest.id,
          amountMinor: reservedAmountMinor,
          idempotencyKey: `buy-request-reserve:${buyRequest.id}`,
          tx,
        });

        return buyRequest.id;
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('Insufficient available balance')
      ) {
        throw new AppException(
          ErrorCode.INSUFFICIENT_BALANCE,
          'Not enough available balance to reserve for this buy request',
          HttpStatus.BAD_REQUEST,
        );
      }
      throw error;
    }

    const buyRequest = await this.prisma.buyRequest.findUniqueOrThrow({
      where: { id: buyRequestId },
      include: {
        itemDefinition: {
          select: {
            id: true,
            slug: true,
            marketHashName: true,
            weapon: true,
            rarity: true,
            iconUrl: true,
          },
        },
      },
    });

    void this.buyRequestMatching
      .matchBuyRequestCreated(buyRequest.id)
      .catch(() => undefined);

    return toJsonSafe(buyRequest);
  }

  async listMine(buyerId: string, itemDefinitionId?: string) {
    const scope = itemDefinitionId
      ? await this.resolveListScope(itemDefinitionId)
      : null;

    const requests = await this.prisma.buyRequest.findMany({
      where: {
        buyerId,
        ...(scope?.type === 'ids'
          ? { itemDefinitionId: { in: scope.ids } }
          : scope?.type === 'base'
            ? {
                itemDefinition: {
                  OR: [
                    { id: { in: scope.ids } },
                    { baseMarketHashName: scope.baseMarketHashName },
                  ],
                },
              }
            : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        itemDefinition: {
          select: {
            id: true,
            slug: true,
            marketHashName: true,
            weapon: true,
            rarity: true,
            iconUrl: true,
          },
        },
      },
    });
    return toJsonSafe(requests);
  }

  async cancel(buyerId: string, buyRequestId: string) {
    const buyRequest = await this.prisma.buyRequest.findUnique({
      where: { id: buyRequestId },
    });
    if (!buyRequest || buyRequest.buyerId !== buyerId) {
      throw new AppException(
        ErrorCode.BUY_REQUEST_NOT_FOUND,
        'Buy request not found',
        HttpStatus.NOT_FOUND,
      );
    }
    if (buyRequest.status !== BuyRequestStatus.OPEN) {
      throw new AppException(
        ErrorCode.BUY_REQUEST_NOT_OPEN,
        'Only open buy requests can be canceled',
        HttpStatus.BAD_REQUEST,
      );
    }

    const releaseAmount = buyRequest.reservedAmountMinor ?? 0n;

    await this.prisma.$transaction(async (tx) => {
      if (releaseAmount > 0n) {
        await this.ledger.releaseBuyRequestHold({
          buyerUserId: buyerId,
          buyRequestId,
          amountMinor: releaseAmount,
          idempotencyKey: `buy-request-cancel:${buyRequestId}`,
          tx,
        });
      }

      await tx.buyRequest.update({
        where: { id: buyRequestId },
        data: {
          status: BuyRequestStatus.CANCELED,
          reservedAmountMinor: 0n,
        },
      });
    });

    const updated = await this.prisma.buyRequest.findUniqueOrThrow({
      where: { id: buyRequestId },
      include: {
        itemDefinition: {
          select: {
            id: true,
            slug: true,
            marketHashName: true,
            weapon: true,
            rarity: true,
            iconUrl: true,
          },
        },
      },
    });

    return toJsonSafe(updated);
  }

  async releaseHoldForExpired(buyRequestId: string): Promise<void> {
    const buyRequest = await this.prisma.buyRequest.findUnique({
      where: { id: buyRequestId },
    });
    if (!buyRequest || buyRequest.status !== BuyRequestStatus.OPEN) {
      return;
    }

    const releaseAmount = buyRequest.reservedAmountMinor ?? 0n;

    await this.prisma.$transaction(async (tx) => {
      if (releaseAmount > 0n) {
        await this.ledger.releaseBuyRequestHold({
          buyerUserId: buyRequest.buyerId,
          buyRequestId,
          amountMinor: releaseAmount,
          idempotencyKey: `buy-request-expire:${buyRequestId}`,
          tx,
        });
      }

      await tx.buyRequest.update({
        where: { id: buyRequestId },
        data: {
          status: BuyRequestStatus.EXPIRED,
          reservedAmountMinor: 0n,
        },
      });
    });
  }

  private async resolveTargetItemDefinition(
    catalogItem: {
      id: string;
      marketHashName: string;
      baseMarketHashName: string | null;
      weapon: string | null;
      rarity: string | null;
      iconUrl: string | null;
      catalogSeeded: boolean;
      availableWears: unknown;
    },
    wear?: string,
  ) {
    const availableWears = parseAvailableWears(catalogItem.availableWears);
    const needsWear =
      catalogItem.catalogSeeded && availableWears.length > 0;

    if (needsWear && !wear) {
      throw new AppException(
        ErrorCode.VALIDATION_ERROR,
        'Select a wear for this skin',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!wear || !catalogItem.catalogSeeded) {
      return catalogItem;
    }

    if (availableWears.length > 0 && !availableWears.includes(wear)) {
      throw new AppException(
        ErrorCode.VALIDATION_ERROR,
        'Selected wear is not available for this skin',
        HttpStatus.BAD_REQUEST,
      );
    }

    const baseName =
      catalogItem.baseMarketHashName ??
      deriveBaseMarketHashName(catalogItem.marketHashName);
    const marketHashName = buildMarketHashNameWithWear(baseName, wear);

    return this.prisma.itemDefinition.upsert({
      where: { marketHashName },
      create: {
        game: 'CS2',
        marketHashName,
        slug: slugifyMarketHashName(marketHashName),
        baseMarketHashName: baseName,
        weapon: catalogItem.weapon,
        rarity: catalogItem.rarity,
        iconUrl: catalogItem.iconUrl,
        catalogSeeded: false,
      },
      update: {
        baseMarketHashName: baseName,
        slug: slugifyMarketHashName(marketHashName),
        weapon: catalogItem.weapon ?? undefined,
        rarity: catalogItem.rarity ?? undefined,
        ...(catalogItem.iconUrl?.trim()
          ? { iconUrl: catalogItem.iconUrl.trim() }
          : {}),
      },
    });
  }

  private async findItemDefinition(ref: string) {
    if (isUuid(ref)) {
      return this.prisma.itemDefinition.findUnique({ where: { id: ref } });
    }

    const bySlug = await this.prisma.itemDefinition.findUnique({
      where: { slug: ref },
    });
    if (bySlug) {
      return bySlug;
    }

    return this.prisma.itemDefinition.findUnique({ where: { id: ref } });
  }

  private async resolveListScope(
    itemDefinitionRef: string,
  ): Promise<
    | { type: 'ids'; ids: string[] }
    | { type: 'base'; ids: string[]; baseMarketHashName: string }
  > {
    const item = await this.findItemDefinition(itemDefinitionRef);
    if (!item) {
      return { type: 'ids', ids: [itemDefinitionRef] };
    }
    if (!item.catalogSeeded) {
      return { type: 'ids', ids: [item.id] };
    }
    return {
      type: 'base',
      ids: [item.id],
      baseMarketHashName:
        item.baseMarketHashName ??
        deriveBaseMarketHashName(item.marketHashName),
    };
  }
}
