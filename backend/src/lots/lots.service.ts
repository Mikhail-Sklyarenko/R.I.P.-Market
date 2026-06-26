import { HttpStatus, Injectable } from '@nestjs/common';
import { InventoryAssetStatus, LotStatus, UserStatus } from '@prisma/client';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { toJsonSafe } from '../common/json-safe.util';
import { InventoryService } from '../inventory/inventory.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLotDto } from './dto/create-lot.dto';
import { buildPricingPreview, calculateCommissionMinor } from './lot-pricing.util';
import { LotStateService } from './lot-state.service';

@Injectable()
export class LotsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lotStateService: LotStateService,
    private readonly inventoryService: InventoryService,
  ) {}

  getPricingPreview(priceMinor: number) {
    return buildPricingPreview(priceMinor);
  }

  async create(sellerId: string, dto: CreateLotDto) {
    const seller = await this.prisma.user.findUnique({
      where: { id: sellerId },
    });
    if (!seller) {
      throw new AppException(ErrorCode.NOT_FOUND, 'Seller not found', HttpStatus.NOT_FOUND);
    }
    if (seller.status !== UserStatus.ACTIVE) {
      throw new AppException(
        ErrorCode.SELLER_NOT_ACTIVE,
        'Your seller account is not active',
        HttpStatus.BAD_REQUEST,
      );
    }

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

    const lot = await this.prisma.$transaction(async (tx) => {
      const created = await tx.lot.create({
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

      await this.lotStateService.recordListed(tx, created.id, sellerId);

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
      include: {
        inventoryAsset: { include: { itemDefinition: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return toJsonSafe(lots);
  }

  async getById(lotId: string) {
    const lot = await this.prisma.lot.findUnique({
      where: { id: lotId },
      include: {
        inventoryAsset: { include: { itemDefinition: true } },
      },
    });
    if (!lot) {
      throw new AppException(ErrorCode.LOT_NOT_FOUND, 'Lot not found', HttpStatus.NOT_FOUND);
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
      throw new AppException(ErrorCode.LOT_NOT_FOUND, 'Lot not found', HttpStatus.NOT_FOUND);
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
