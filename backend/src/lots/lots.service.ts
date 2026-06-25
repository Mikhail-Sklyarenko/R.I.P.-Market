import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InventoryAssetStatus, LotStatus, UserStatus } from '@prisma/client';
import { toJsonSafe } from '../common/json-safe.util';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLotDto } from './dto/create-lot.dto';
import { LotStateService } from './lot-state.service';

@Injectable()
export class LotsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lotStateService: LotStateService,
  ) {}

  async create(sellerId: string, dto: CreateLotDto) {
    const seller = await this.prisma.user.findUnique({
      where: { id: sellerId },
    });
    if (!seller) {
      throw new NotFoundException('Seller not found');
    }
    if (seller.status !== UserStatus.ACTIVE) {
      throw new BadRequestException('Seller is not ACTIVE');
    }

    const asset = await this.prisma.inventoryAsset.findUnique({
      where: { id: dto.inventoryAssetId },
    });
    if (!asset || asset.ownerId !== sellerId) {
      throw new NotFoundException('Inventory asset not found for seller');
    }
    if (asset.status !== InventoryAssetStatus.AVAILABLE) {
      throw new BadRequestException('Inventory asset is not available');
    }
    if (!asset.tradable) {
      throw new BadRequestException('Inventory asset is not tradable');
    }
    if (asset.tradeLockUntil && asset.tradeLockUntil > new Date()) {
      throw new BadRequestException('Inventory asset is trade-locked');
    }

    const existingLot = await this.prisma.lot.findFirst({
      where: {
        inventoryAssetId: asset.id,
        status: { in: [LotStatus.ACTIVE, LotStatus.RESERVED] },
      },
    });
    if (existingLot) {
      throw new BadRequestException('Asset already has active or reserved lot');
    }

    const commissionMinor = this.calculateCommission(dto.priceMinor);
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

      await tx.inventoryAsset.update({
        where: { id: asset.id },
        data: { status: InventoryAssetStatus.LISTED },
      });

      await this.lotStateService.recordListed(tx, created.id, sellerId);

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
      throw new NotFoundException('Lot not found');
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
      throw new NotFoundException('Lot not found');
    }
    if (lot.sellerId !== sellerId) {
      throw new BadRequestException('Only lot seller can cancel this lot');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await this.lotStateService.transition(tx, {
        lotId: lot.id,
        from: lot.status,
        to: LotStatus.CANCELED,
        actorUserId: sellerId,
      });

      const updatedLot = await tx.lot.findUnique({
        where: { id: lot.id },
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

    if (!updated) {
      throw new NotFoundException('Lot not found after cancel');
    }

    return toJsonSafe(updated);
  }

  private calculateCommission(priceMinor: number): number {
    return Math.floor(priceMinor * 0.05);
  }
}
