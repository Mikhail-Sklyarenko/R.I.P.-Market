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
import { CreateBulkLotsDto } from './dto/create-bulk-lots.dto';
import { ListLotsQueryDto } from './dto/list-lots-query.dto';
import { DEFAULT_LOTS_PAGE_LIMIT } from './lots-list.util';
import {
  buildPricingPreview,
  calculateCommissionMinor,
} from './lot-pricing.util';
import { LotStateService } from './lot-state.service';
import { hasValidTradeUrl } from '../users/trade-url.util';
import { SteamVacService } from '../users/steam-vac.service';
import { SteamMarketPriceService } from '../catalog/steam-market-price.service';
import { ReferencePriceService } from '../catalog/reference-price.service';
import { assertListingEligible } from './listing-eligibility.util';
import { assertBulkListingAssets } from './bulk-listing.util';
import { buildLotListingSnapshotData } from './lot-listing-snapshot.util';
import {
  buildFallbackInspectLink,
  resolveInspectLink,
} from './inspect-link.util';
import {
  buildSteamMarketListingUrl,
  resolveSteamMarketHashName,
} from './steam-market-link.util';
import { pickSimilarLots } from './similar-lots.util';

@Injectable()
export class LotsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lotStateService: LotStateService,
    private readonly inventoryService: InventoryService,
    private readonly steamVacService: SteamVacService,
    private readonly steamMarketPrice: SteamMarketPriceService,
    private readonly referencePrice: ReferencePriceService,
  ) {}

  getPricingPreview(priceMinor: number) {
    return buildPricingPreview(priceMinor);
  }

  async create(sellerId: string, dto: CreateLotDto) {
    const seller = await this.assertSellerCanList(sellerId);

    await this.inventoryService.syncForListing(sellerId, seller.steamId);

    const asset = await this.prisma.inventoryAsset.findUnique({
      where: { id: dto.inventoryAssetId },
      include: { itemDefinition: true },
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

    assertListingEligible({
      status: asset.status,
      tradable: asset.tradable,
      marketable: asset.marketable,
      tradeLockUntil: asset.tradeLockUntil,
      itemDefinition: asset.itemDefinition,
    });

    if (!seller.steamId) {
      throw new AppException(
        ErrorCode.TRADE_URL_REQUIRED,
        'Link your Steam account before listing items',
        HttpStatus.BAD_REQUEST,
      );
    }
    const sellerSteamId = seller.steamId;

    const lot = await this.prisma.$transaction(async (tx) =>
      this.listAssetInTransaction(
        tx,
        sellerId,
        sellerSteamId,
        asset,
        dto.priceMinor,
      ),
    );

    return toJsonSafe(lot);
  }

  async createBulk(sellerId: string, dto: CreateBulkLotsDto) {
    const seller = await this.assertSellerCanList(sellerId);
    await this.inventoryService.syncForListing(sellerId, seller.steamId);

    const uniqueIds = [...new Set(dto.inventoryAssetIds)];
    const assets = await this.prisma.inventoryAsset.findMany({
      where: { id: { in: uniqueIds } },
      include: { itemDefinition: true },
    });

    if (assets.length !== uniqueIds.length) {
      throw new AppException(
        ErrorCode.INVENTORY_ASSET_NOT_FOUND,
        'One or more inventory items were not found',
        HttpStatus.NOT_FOUND,
      );
    }

    for (const asset of assets) {
      if (asset.ownerId !== sellerId) {
        throw new AppException(
          ErrorCode.INVENTORY_ASSET_NOT_FOUND,
          'Inventory item not found',
          HttpStatus.NOT_FOUND,
          { inventoryAssetId: asset.id },
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
          { lotId: existingLot.id, inventoryAssetId: asset.id },
        );
      }
    }

    assertBulkListingAssets(assets);

    if (!seller.steamId) {
      throw new AppException(
        ErrorCode.TRADE_URL_REQUIRED,
        'Link your Steam account before listing items',
        HttpStatus.BAD_REQUEST,
      );
    }
    const sellerSteamId = seller.steamId;

    const lots = await this.prisma.$transaction(async (tx) => {
      const createdLots: NonNullable<
        Awaited<ReturnType<LotsService['listAssetInTransaction']>>
      >[] = [];
      for (const asset of assets) {
        const lot = await this.listAssetInTransaction(
          tx,
          sellerId,
          sellerSteamId,
          asset,
          dto.priceMinor,
        );
        if (!lot) {
          throw new AppException(
            ErrorCode.INTERNAL_ERROR,
            'Failed to create lot listing',
            HttpStatus.INTERNAL_SERVER_ERROR,
            { inventoryAssetId: asset.id },
          );
        }
        createdLots.push(lot);
      }
      return createdLots;
    });

    return toJsonSafe({
      lots,
      createdCount: lots.length,
      marketHashName: assets[0]!.itemDefinition.marketHashName,
    });
  }

  private async assertSellerCanList(sellerId: string) {
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
    return seller;
  }

  private async listAssetInTransaction(
    tx: Prisma.TransactionClient,
    sellerId: string,
    sellerSteamId: string,
    asset: {
      id: string;
      status: string;
      tradable: boolean;
      marketable: boolean;
      tradeLockUntil: Date | null;
      itemDefinition: { marketHashName: string };
    } & Parameters<typeof buildLotListingSnapshotData>[0],
    priceMinor: number,
  ) {
    assertListingEligible({
      status: asset.status,
      tradable: asset.tradable,
      marketable: asset.marketable,
      tradeLockUntil: asset.tradeLockUntil,
      itemDefinition: asset.itemDefinition,
    });

    const snapshotData = buildLotListingSnapshotData(asset, sellerSteamId);
    const commissionMinor = calculateCommissionMinor(priceMinor);
    const sellerReceiveMinor = priceMinor - commissionMinor;
    const reusableLot = await tx.lot.findFirst({
      where: { inventoryAssetId: asset.id },
      orderBy: { createdAt: 'desc' },
      include: {
        inventoryAsset: { include: { itemDefinition: true } },
      },
    });

    const created =
      reusableLot &&
      reusableLot.status !== LotStatus.ACTIVE &&
      reusableLot.status !== LotStatus.RESERVED
        ? await tx.lot.update({
            where: { id: reusableLot.id },
            data: {
              status: LotStatus.ACTIVE,
              priceMinor: BigInt(priceMinor),
              commissionMinor: BigInt(commissionMinor),
              sellerReceiveMinor: BigInt(sellerReceiveMinor),
              reservedByUserId: null,
            },
            include: {
              inventoryAsset: { include: { itemDefinition: true } },
              listingSnapshot: true,
            },
          })
        : await tx.lot.create({
            data: {
              sellerId,
              inventoryAssetId: asset.id,
              status: LotStatus.ACTIVE,
              priceMinor: BigInt(priceMinor),
              commissionMinor: BigInt(commissionMinor),
              sellerReceiveMinor: BigInt(sellerReceiveMinor),
            },
            include: {
              inventoryAsset: { include: { itemDefinition: true } },
              listingSnapshot: true,
            },
          });

    await tx.lotListingSnapshot.upsert({
      where: { lotId: created.id },
      create: {
        lotId: created.id,
        ...snapshotData,
      },
      update: snapshotData,
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

    return tx.lot.findUnique({
      where: { id: created.id },
      include: {
        inventoryAsset: { include: { itemDefinition: true } },
        listingSnapshot: true,
      },
    });
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

    const [steamPrices, referencePrices] = await Promise.all([
      this.steamMarketPrice.getPricesWithMeta(
        lots.map((lot) => {
          const snapshotName = lot.listingSnapshot?.marketHashName;
          return (
            snapshotName ?? lot.inventoryAsset.itemDefinition.marketHashName
          );
        }),
      ),
      this.referencePrice.getPricesWithMeta(
        lots.map((lot) => {
          const snapshotName = lot.listingSnapshot?.marketHashName;
          return (
            snapshotName ?? lot.inventoryAsset.itemDefinition.marketHashName
          );
        }),
      ),
    ]);
    const latestSteamPriceFetch =
      Object.values(steamPrices)
        .map((entry) => entry.fetchedAt)
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1) ?? null;
    const latestReferencePriceFetch =
      Object.values(referencePrices)
        .map((entry) => entry.fetchedAt)
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1) ?? null;

    const enrichedLots = lots.map((lot) => {
      const marketHashName =
        lot.listingSnapshot?.marketHashName ??
        lot.inventoryAsset.itemDefinition.marketHashName;
      return {
        ...lot,
        steamPriceMinor: steamPrices[marketHashName]?.priceMinor ?? null,
        steamPriceFetchedAt: steamPrices[marketHashName]?.fetchedAt ?? null,
        buffPriceMinor: referencePrices[marketHashName]?.buffPriceMinor ?? null,
        csfloatPriceMinor:
          referencePrices[marketHashName]?.csfloatPriceMinor ?? null,
        marketplacePriceMinor: lot.priceMinor.toString(),
      };
    });

    return toJsonSafe({
      items: enrichedLots,
      page,
      limit,
      total,
      steamPriceFetchedAt: latestSteamPriceFetch,
      referencePriceFetchedAt: latestReferencePriceFetch,
    });
  }

  async listSimilar(lotId: string, limit = 6) {
    const source = await this.prisma.lot.findUnique({
      where: { id: lotId },
      include: {
        inventoryAsset: { include: { itemDefinition: true } },
        listingSnapshot: true,
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
    const marketHashName =
      source.listingSnapshot?.marketHashName ??
      source.inventoryAsset.itemDefinition.marketHashName;
    const similarLimit = Math.min(Math.max(limit, 1), 24);

    const candidates = await this.prisma.lot.findMany({
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
      take: 120,
    });

    const picked = pickSimilarLots(
      {
        id: source.id,
        itemDefinitionId,
        marketHashName,
        floatValue:
          source.listingSnapshot?.floatValue ??
          source.inventoryAsset.floatValue,
        wear: source.listingSnapshot?.wear ?? source.inventoryAsset.wear,
      },
      candidates.map((lot) => ({
        id: lot.id,
        priceMinor: lot.priceMinor,
        floatValue:
          lot.listingSnapshot?.floatValue ?? lot.inventoryAsset.floatValue,
        wear: lot.listingSnapshot?.wear ?? lot.inventoryAsset.wear,
        itemDefinitionId: lot.inventoryAsset.itemDefinitionId,
        marketHashName:
          lot.listingSnapshot?.marketHashName ??
          lot.inventoryAsset.itemDefinition.marketHashName,
      })),
      similarLimit,
    );

    const pickedIds = new Set(picked.map((entry) => entry.id));
    const orderedLots = candidates.filter((lot) => pickedIds.has(lot.id));
    orderedLots.sort(
      (a, b) =>
        picked.findIndex((entry) => entry.id === a.id) -
        picked.findIndex((entry) => entry.id === b.id),
    );

    return toJsonSafe(orderedLots);
  }

  private lotInclude() {
    return {
      inventoryAsset: { include: { itemDefinition: true } },
      listingSnapshot: true,
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

    if (query.floatMin !== undefined || query.floatMax !== undefined) {
      where.AND = [
        ...(Array.isArray(where.AND)
          ? where.AND
          : where.AND
            ? [where.AND]
            : []),
        {
          OR: [
            {
              listingSnapshot: {
                floatValue: {
                  ...(query.floatMin !== undefined
                    ? { gte: query.floatMin }
                    : {}),
                  ...(query.floatMax !== undefined
                    ? { lte: query.floatMax }
                    : {}),
                },
              },
            },
            {
              listingSnapshot: { is: null },
              inventoryAsset: {
                floatValue: {
                  ...(query.floatMin !== undefined
                    ? { gte: query.floatMin }
                    : {}),
                  ...(query.floatMax !== undefined
                    ? { lte: query.floatMax }
                    : {}),
                },
              },
            },
          ],
        },
      ];
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
        ...this.lotInclude(),
        seller: { select: { steamId: true } },
      },
    });
    if (!lot) {
      throw new AppException(
        ErrorCode.LOT_NOT_FOUND,
        'Lot not found',
        HttpStatus.NOT_FOUND,
      );
    }

    const marketHashName =
      lot.listingSnapshot?.marketHashName ??
      lot.inventoryAsset.itemDefinition.marketHashName;
    const wear =
      lot.listingSnapshot?.wear ?? lot.inventoryAsset.wear ?? null;
    const steamMarketHashName = resolveSteamMarketHashName(
      marketHashName,
      wear,
    );
    const [steamPriceMeta, referencePriceMeta] = await Promise.all([
      this.steamMarketPrice.getPriceMeta(steamMarketHashName),
      this.referencePrice.getPricesWithMeta([steamMarketHashName]),
    ]);
    const inspectLink =
      lot.listingSnapshot?.inspectLink ??
      (lot.seller.steamId
        ? (resolveInspectLink(
            lot.inventoryAsset.inspectLinkTemplate,
            lot.seller.steamId,
            lot.inventoryAsset.assetExternalId,
          ) ??
          buildFallbackInspectLink({
            ownerSteamId: lot.seller.steamId,
            assetExternalId: lot.inventoryAsset.assetExternalId,
            classId: lot.inventoryAsset.classExternalId,
            instanceId: lot.inventoryAsset.instanceExternalId,
          }))
        : null);

    return toJsonSafe({
      ...lot,
      inspectLink,
      steamMarketHashName,
      steamMarketUrl: buildSteamMarketListingUrl(marketHashName, wear),
      steamPriceMinor: steamPriceMeta.priceMinor,
      steamPriceFetchedAt: steamPriceMeta.fetchedAt,
      buffPriceMinor:
        referencePriceMeta[steamMarketHashName]?.buffPriceMinor ?? null,
      csfloatPriceMinor:
        referencePriceMeta[steamMarketHashName]?.csfloatPriceMinor ?? null,
      referencePriceFetchedAt:
        referencePriceMeta[steamMarketHashName]?.fetchedAt ?? null,
      marketplacePriceMinor: lot.priceMinor.toString(),
    });
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
