import { HttpStatus, Injectable } from '@nestjs/common';
import {
  InventoryAssetStatus,
  LotStatus,
  Prisma,
  UserStatus,
} from '@prisma/client';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { toJsonSafe } from '../common/json-safe.util';
import { InventoryService } from '../inventory/inventory.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLotDto } from './dto/create-lot.dto';
import { ListLotsQueryDto } from './dto/list-lots-query.dto';
import { DEFAULT_LOTS_PAGE_LIMIT } from './lots-list.util';
import {
  buildPricingPreview,
  calculateCommissionMinor,
} from './lot-pricing.util';
import { LotStateService } from './lot-state.service';
import { hasValidTradeUrl } from '../users/trade-url.util';
import { SteamVacService } from '../users/steam-vac.service';

@Injectable()
export class LotsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lotStateService: LotStateService,
    private readonly inventoryService: InventoryService,
    private readonly steamVacService: SteamVacService,
  ) {}

  getPricingPreview(priceMinor: number) {
    return buildPricingPreview(priceMinor);
  }

  async create(sellerId: string, dto: CreateLotDto) {
    const seller = await this.prisma.user.findUnique({
      where: { id: sellerId },
    });
    if (!seller) {
      throw new AppException(
        ErrorCode.NOT_FOUND,
        'Seller not found',
        HttpStatus.NOT_FOUND,
      );
    }
    if (seller.status !== UserStatus.ACTIVE) {
      throw new AppException(
        ErrorCode.SELLER_NOT_ACTIVE,
        'Your seller account is not active',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!hasValidTradeUrl(seller.tradeUrl)) {
      throw new AppException(
        ErrorCode.TRADE_URL_REQUIRED,
        'Add your Steam Trade URL in account settings before listing items',
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.steamVacService.assertCanTrade(seller);

    await this.inventoryService.syncForListing(sellerId, seller.steamId);

    const asset = await this.prisma.inventoryAsset.findUnique({
      where: { id: dto.inventoryAssetId },
    });
    if (!asset || asset.ownerId !== sellerId) {
      throw new AppException(
        ErrorCode.INVENTORY_ASSET_NOT_FOUND,
        'Inventory item not found',
        HttpStatus.NOT_FOUND,
      );
    }

    const existingLot = await this.prisma.lot.findFirst({
      where: {
        inventoryAssetId: asset.id,
        status: { in: [LotStatus.ACTIVE, LotStatus.RESERVED] },
      },
    });
    if (existingLot) {
      throw new AppException(
        ErrorCode.LOT_ALREADY_EXISTS_FOR_ASSET,
        'This item already has an active listing',
        HttpStatus.BAD_REQUEST,
        { lotId: existingLot.id },
      );
    }

    if (asset.status !== InventoryAssetStatus.AVAILABLE) {
      throw new AppException(
        ErrorCode.INVENTORY_ASSET_NOT_AVAILABLE,
        'This item is not available for listing',
        HttpStatus.BAD_REQUEST,
        { status: asset.status },
      );
    }
    if (!asset.tradable) {
      throw new AppException(
        ErrorCode.INVENTORY_ASSET_NOT_TRADABLE,
        'This item is not tradable',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (asset.tradeLockUntil && asset.tradeLockUntil > new Date()) {
      throw new AppException(
        ErrorCode.INVENTORY_ASSET_TRADE_LOCKED,
        'This item is trade-locked',
        HttpStatus.BAD_REQUEST,
        { tradeLockUntil: asset.tradeLockUntil.toISOString() },
      );
    }

    const commissionMinor = calculateCommissionMinor(dto.priceMinor);
    const sellerReceiveMinor = dto.priceMinor - commissionMinor;
    const reusableLot = await this.prisma.lot.findFirst({
      where: { inventoryAssetId: asset.id },
      orderBy: { createdAt: 'desc' },
      include: {
        inventoryAsset: { include: { itemDefinition: true } },
      },
    });

    const lot = await this.prisma.$transaction(async (tx) => {
      const created =
        reusableLot && reusableLot.status !== LotStatus.ACTIVE && reusableLot.status !== LotStatus.RESERVED
          ? await tx.lot.update({
              where: { id: reusableLot.id },
              data: {
                status: LotStatus.ACTIVE,
                priceMinor: BigInt(dto.priceMinor),
                commissionMinor: BigInt(commissionMinor),
                sellerReceiveMinor: BigInt(sellerReceiveMinor),
                reservedByUserId: null,
              },
              include: {
                inventoryAsset: { include: { itemDefinition: true } },
              },
            })
          : await tx.lot.create({
              data: {
                sellerId,
                inventoryAssetId: asset.id,
                status: LotStatus.ACTIVE,
                priceMinor: BigInt(dto.priceMinor),
                commissionMinor: BigInt(commissionMinor),
                sellerReceiveMinor: BigInt(sellerReceiveMinor),
              },
              include: {
                inventoryAsset: { include: { itemDefinition: true } },
              },
            });

      if (reusableLot && reusableLot.id === created.id) {
        await tx.lotStatusEvent.create({
          data: {
            lotId: created.id,
            fromStatus: reusableLot.status,
            toStatus: LotStatus.ACTIVE,
            actorUserId: sellerId,
            reason: 'relisted',
          },
        });
      } else {
        await this.lotStateService.recordListed(tx, created.id, sellerId);
      }

      await tx.inventoryAsset.update({
        where: { id: asset.id },
        data: { status: InventoryAssetStatus.LISTED },
      });

      return created;
    });

    return toJsonSafe(lot);
  }

  async listActive() {
    const lots = await this.prisma.lot.findMany({
      where: { status: LotStatus.ACTIVE },
      include: this.lotInclude(),
      orderBy: { createdAt: 'desc' },
    });
    return toJsonSafe(lots);
  }

  async listActiveFiltered(query: ListLotsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? DEFAULT_LOTS_PAGE_LIMIT;
    const skip = (page - 1) * limit;
    const where = this.buildActiveLotsWhere(query);
    const orderBy = this.buildLotsOrderBy(query.sort);

    const [total, lots] = await Promise.all([
      this.prisma.lot.count({ where }),
      this.prisma.lot.findMany({
        where,
        include: this.lotInclude(),
        orderBy,
        skip,
        take: limit,
      }),
    ]);

    return toJsonSafe({
      items: lots,
      page,
      limit,
      total,
    });
  }

  async listSimilar(lotId: string, limit = 6) {
    const source = await this.prisma.lot.findUnique({
      where: { id: lotId },
      include: {
        inventoryAsset: { include: { itemDefinition: true } },
      },
    });

    if (!source) {
      throw new AppException(
        ErrorCode.LOT_NOT_FOUND,
        'Lot not found',
        HttpStatus.NOT_FOUND,
      );
    }

    const itemDefinitionId = source.inventoryAsset.itemDefinitionId;
    const weapon = source.inventoryAsset.itemDefinition.weapon;
    const similarLimit = Math.min(Math.max(limit, 1), 24);

    const lots = await this.prisma.lot.findMany({
      where: {
        status: LotStatus.ACTIVE,
        id: { not: lotId },
        OR: [
          { inventoryAsset: { itemDefinitionId } },
          ...(weapon
            ? [{ inventoryAsset: { itemDefinition: { weapon } } }]
            : []),
        ],
      },
      include: this.lotInclude(),
      orderBy: { createdAt: 'desc' },
      take: similarLimit,
    });

    return toJsonSafe(lots);
  }

  private lotInclude() {
    return {
      inventoryAsset: { include: { itemDefinition: true } },
    } as const;
  }

  private buildActiveLotsWhere(query: ListLotsQueryDto): Prisma.LotWhereInput {
    const where: Prisma.LotWhereInput = {
      status: LotStatus.ACTIVE,
    };

    const itemDefinitionFilter: Prisma.ItemDefinitionWhereInput = {};

    if (query.q) {
      itemDefinitionFilter.marketHashName = {
        contains: query.q,
        mode: 'insensitive',
      };
    }
    if (query.weapon) {
      itemDefinitionFilter.weapon = {
        equals: query.weapon,
        mode: 'insensitive',
      };
    }
    if (query.rarity) {
      itemDefinitionFilter.rarity = {
        equals: query.rarity,
        mode: 'insensitive',
      };
    }

    const inventoryAssetFilter: Prisma.InventoryAssetWhereInput = {};
    if (Object.keys(itemDefinitionFilter).length > 0) {
      inventoryAssetFilter.itemDefinition = itemDefinitionFilter;
    }
    if (query.wear) {
      inventoryAssetFilter.wear = {
        equals: query.wear,
        mode: 'insensitive',
      };
    }

    if (Object.keys(inventoryAssetFilter).length > 0) {
      where.inventoryAsset = inventoryAssetFilter;
    }

    if (
      query.minPriceMinor !== undefined ||
      query.maxPriceMinor !== undefined
    ) {
      where.priceMinor = {
        ...(query.minPriceMinor !== undefined
          ? { gte: BigInt(query.minPriceMinor) }
          : {}),
        ...(query.maxPriceMinor !== undefined
          ? { lte: BigInt(query.maxPriceMinor) }
          : {}),
      };
    }

    return where;
  }

  private buildLotsOrderBy(
    sort?: ListLotsQueryDto['sort'],
  ): Prisma.LotOrderByWithRelationInput {
    if (sort === 'price_asc') {
      return { priceMinor: 'asc' };
    }
    if (sort === 'price_desc') {
      return { priceMinor: 'desc' };
    }
    return { createdAt: 'desc' };
  }

  async getById(lotId: string) {
    const lot = await this.prisma.lot.findUnique({
      where: { id: lotId },
      include: {
        inventoryAsset: { include: { itemDefinition: true } },
      },
    });
    if (!lot) {
      throw new AppException(
        ErrorCode.LOT_NOT_FOUND,
        'Lot not found',
        HttpStatus.NOT_FOUND,
      );
    }
    return toJsonSafe(lot);
  }

  async listMyLots(sellerId: string) {
    const lots = await this.prisma.lot.findMany({
      where: { sellerId },
      include: {
        inventoryAsset: { include: { itemDefinition: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return toJsonSafe(lots);
  }

  async cancel(sellerId: string, lotId: string) {
    const lot = await this.prisma.lot.findUnique({
      where: { id: lotId },
      include: { inventoryAsset: true },
    });
    if (!lot) {
      throw new AppException(
        ErrorCode.LOT_NOT_FOUND,
        'Lot not found',
        HttpStatus.NOT_FOUND,
      );
    }
    if (lot.sellerId !== sellerId) {
      throw new AppException(
        ErrorCode.FORBIDDEN,
        'Only the lot seller can cancel this listing',
        HttpStatus.FORBIDDEN,
      );
    }

    this.lotStateService.ensureTransition(lot.status, LotStatus.CANCELED);

    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedLot = await tx.lot.update({
        where: { id: lot.id },
        data: { status: LotStatus.CANCELED },
        include: {
          inventoryAsset: { include: { itemDefinition: true } },
        },
      });

      await tx.inventoryAsset.update({
        where: { id: lot.inventoryAssetId },
        data: { status: InventoryAssetStatus.AVAILABLE },
      });

      return updatedLot;
    });

    return toJsonSafe(updated);
  }
}
