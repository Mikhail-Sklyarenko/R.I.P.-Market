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
import { CreateBuyRequestDto } from './dto/create-buy-request.dto';
import { BuyRequestMatchingService } from './buy-request-matching.service';

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

    const catalogItem = await this.prisma.itemDefinition.findUnique({
      where: { id: itemDefinitionId },
    });
    if (!catalogItem) {
      throw new AppException(
        ErrorCode.NOT_FOUND,
        'Item not found',
        HttpStatus.NOT_FOUND,
      );
    }

    const item = await this.resolveTargetItemDefinition(catalogItem, dto.wear);

    const existingOpen = await this.prisma.buyRequest.findFirst({
      where: {
        buyerId,
        itemDefinitionId: item.id,
        status: BuyRequestStatus.OPEN,
      },
    });
    if (existingOpen) {
      throw new AppException(
        ErrorCode.BUY_REQUEST_ALREADY_OPEN,
        'You already have an open buy request for this item',
        HttpStatus.BAD_REQUEST,
        { buyRequestId: existingOpen.id },
      );
    }

    const buyRequest = await this.prisma.buyRequest.create({
      data: {
        buyerId,
        itemDefinitionId: item.id,
        maxPriceMinor:
          dto.maxPriceMinor !== undefined
            ? BigInt(dto.maxPriceMinor)
            : undefined,
      },
      include: {
        itemDefinition: {
          select: {
            id: true,
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

    const updated = await this.prisma.buyRequest.update({
      where: { id: buyRequestId },
      data: { status: BuyRequestStatus.CANCELED },
      include: {
        itemDefinition: {
          select: {
            id: true,
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
        baseMarketHashName: baseName,
        weapon: catalogItem.weapon,
        rarity: catalogItem.rarity,
        iconUrl: catalogItem.iconUrl,
        catalogSeeded: false,
      },
      update: {
        baseMarketHashName: baseName,
        weapon: catalogItem.weapon ?? undefined,
        rarity: catalogItem.rarity ?? undefined,
        ...(catalogItem.iconUrl?.trim()
          ? { iconUrl: catalogItem.iconUrl.trim() }
          : {}),
      },
    });
  }

  private async resolveListScope(
    itemDefinitionId: string,
  ): Promise<
    | { type: 'ids'; ids: string[] }
    | { type: 'base'; ids: string[]; baseMarketHashName: string }
  > {
    const item = await this.prisma.itemDefinition.findUnique({
      where: { id: itemDefinitionId },
      select: {
        id: true,
        catalogSeeded: true,
        baseMarketHashName: true,
        marketHashName: true,
      },
    });
    if (!item) {
      return { type: 'ids', ids: [itemDefinitionId] };
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
