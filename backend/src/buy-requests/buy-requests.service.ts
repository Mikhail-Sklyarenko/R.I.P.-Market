import { HttpStatus, Injectable } from '@nestjs/common';
import { BuyRequestStatus, UserStatus } from '@prisma/client';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { toJsonSafe } from '../common/json-safe.util';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBuyRequestDto } from './dto/create-buy-request.dto';
import { BuyRequestMatchingService } from './buy-request-matching.service';

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

    const item = await this.prisma.itemDefinition.findUnique({
      where: { id: itemDefinitionId },
    });
    if (!item) {
      throw new AppException(
        ErrorCode.NOT_FOUND,
        'Item not found',
        HttpStatus.NOT_FOUND,
      );
    }

    const existingOpen = await this.prisma.buyRequest.findFirst({
      where: {
        buyerId,
        itemDefinitionId,
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
        itemDefinitionId,
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
    const requests = await this.prisma.buyRequest.findMany({
      where: {
        buyerId,
        ...(itemDefinitionId ? { itemDefinitionId } : {}),
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
}
