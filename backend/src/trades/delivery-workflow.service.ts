import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  observeSteamInventory,
  type InventoryBaseline,
  mapInventoryDelivery,
} from './inventory-observation';
import type { TradeVerificationResult } from '../providers/trade/trade-provider.interface';

export const DELIVERY_VERSION = 2;
export const PROTECTION_MS = 8 * 24 * 60 * 60 * 1000;
@Injectable()
export class DeliveryWorkflowService {
  private readonly logger = new Logger(DeliveryWorkflowService.name);
  constructor(private readonly prisma: PrismaService) {}

  /** Called before dispatch, never after an offer may have been submitted. */
  async prepare(orderId: string): Promise<boolean> {
    const operation = await this.prisma.tradeOperation.findUnique({
      where: { orderId },
      include: { order: { include: { seller: true, buyer: true } } },
    });
    if (
      !operation ||
      operation.order.status !== 'WAITING_TRADE' ||
      operation.verificationStage === 'MANUAL_REVIEW'
    )
      return false;
    if (operation.nextPreparationAt && operation.nextPreparationAt > new Date())
      return false;
    if (operation.inventoryBaseline) {
      const baseline = operation.inventoryBaseline as InventoryBaseline;
      // Never silently reuse an ancient pre-trade snapshot for a new send.
      if (
        !operation.externalOfferId &&
        Date.now() - Date.parse(baseline.buyer.fetchedAt) > 30 * 60_000
      ) {
        await this.prisma.tradeOperation.updateMany({
          where: { id: operation.id, status: 'WAITING' },
          data: {
            verificationStage: 'MANUAL_REVIEW',
            failReasonCode: 'BASELINE_EXPIRED',
          },
        });
        return false;
      }
      return true;
    }
    if (
      operation.externalOfferId ||
      !operation.order.seller.steamId ||
      !operation.order.buyer.steamId
    )
      return false;
    const sent = await this.prisma.tradeTask.findFirst({
      where: { orderId, sendStartedAt: { not: null } },
    });
    if (sent) return false;
    const ids = [
      operation.order.seller.steamId,
      operation.order.buyer.steamId,
    ].sort();
    const acquired = await this.prisma
      .$transaction(async (tx) => {
        // Terminal orders with a proven mapping, or canceled before sending,
        // cannot pollute a subsequent delta window. Unresolved expired locks stay
        // quarantined; time alone is not proof that an offer wasn't sent.
        await tx.$executeRaw`DELETE FROM "SteamMappingLease" l USING "Order" o, "TradeOperation" t WHERE l."orderId"=o.id AND t."orderId"=o.id AND (t."deliveryProof" IS NOT NULL OR (o.status='CANCELED' AND t."externalOfferId" IS NULL))`;
        for (const steamId of ids) {
          // An expired lease with unresolved transfer cannot be reassigned: its
          // outcome is uncertain. Renewal is allowed only for the same order.
          const rows = await tx.$queryRaw<
            { orderId: string }[]
          >`INSERT INTO "SteamMappingLease" ("steamId","orderId","leaseUntil") VALUES (${steamId},${orderId},NOW()+INTERVAL '30 minutes') ON CONFLICT ("steamId") DO UPDATE SET "leaseUntil"=EXCLUDED."leaseUntil" WHERE "SteamMappingLease"."orderId"=EXCLUDED."orderId" RETURNING "orderId"`;
          if (!rows.length) throw new Error('MAPPING_WINDOW_BUSY');
        }
        return true;
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.message === 'MAPPING_WINDOW_BUSY')
          return false;
        throw error;
      });
    if (!acquired) {
      await this.prisma.tradeOperation.updateMany({
        where: { id: operation.id, status: 'WAITING' },
        data: { failReasonCode: 'MAPPING_WINDOW_BUSY' },
      });
      return false;
    }
    try {
      const seller = await observeSteamInventory(
        operation.order.seller.steamId,
      );
      const buyer = await observeSteamInventory(operation.order.buyer.steamId);
      const original = seller.assets.find(
        (asset) =>
          asset.assetId === operation.expectedAssetId &&
          asset.contextId === '2',
      );
      if (!original) throw new Error('BASELINE_ORIGINAL_MISSING');
      const changed = await this.prisma.tradeOperation.updateMany({
        where: {
          id: operation.id,
          inventoryBaseline: { equals: Prisma.DbNull },
          externalOfferId: null,
          status: 'WAITING',
        },
        data: {
          inventoryBaseline: JSON.parse(
            JSON.stringify({ seller, buyer, original }),
          ) as Prisma.InputJsonValue,
          tradeBinding: `p2pcs:${randomUUID()}`,
          verificationStage: 'OFFER_CREATED',
          failReasonCode: null,
          nextPreparationAt: null,
        },
      });
      return (
        changed.count === 1 ||
        !!(await this.prisma.tradeOperation.findUnique({ where: { orderId } }))
          ?.inventoryBaseline
      );
    } catch (error: unknown) {
      const reasonCode =
        error instanceof Error && error.message === 'BASELINE_ORIGINAL_MISSING'
          ? 'BASELINE_ORIGINAL_MISSING'
          : 'BASELINE_UNAVAILABLE';
      // No task was handed out on this failed preparation attempt.
      await this.prisma
        .$executeRaw`DELETE FROM "SteamMappingLease" WHERE "orderId"=${orderId} AND NOT EXISTS (SELECT 1 FROM "TradeOperation" WHERE "orderId"=${orderId} AND ("inventoryBaseline" IS NOT NULL OR "externalOfferId" IS NOT NULL))`;
      await this.prisma.tradeOperation.updateMany({
        where: { id: operation.id, status: 'WAITING' },
        data: {
          nextPreparationAt: new Date(
            Date.now() + 120_000 + Math.floor(Math.random() * 30_000),
          ),
          failReasonCode: reasonCode,
        },
      });
      this.logger.warn(
        JSON.stringify({
          event: 'delivery_verification_retry',
          orderId,
          reasonCode,
        }),
      );
      return false;
    }
  }

  async verify(orderId: string, verification: TradeVerificationResult) {
    if (
      verification.status !== 'accepted' ||
      !verification.receiptVerified ||
      !verification.tradeId
    )
      return { result: 'unknown' as const };
    const op = await this.prisma.tradeOperation.findUnique({
      where: { orderId },
      include: { order: { include: { seller: true, buyer: true } } },
    });
    if (
      !op?.expectedAssetId ||
      !op.externalOfferId ||
      !op.order.seller.steamId ||
      !op.order.buyer.steamId
    )
      return { result: 'unknown' as const };
    const seller = await observeSteamInventory(op.order.seller.steamId);
    const buyer = await observeSteamInventory(op.order.buyer.steamId);
    const prior = op.deliveryProof as {
      version?: number;
      offerId?: string;
      tradeId?: string;
      originalAssetId?: string;
      sellerSteamId?: string;
      buyerSteamId?: string;
      destinationAssetId?: string;
      mappingMethod?: string;
    } | null;
    if (prior) {
      if (
        prior.version !== DELIVERY_VERSION ||
        prior.offerId !== op.externalOfferId ||
        prior.tradeId !== verification.tradeId ||
        prior.originalAssetId !== op.expectedAssetId ||
        prior.sellerSteamId !== op.order.seller.steamId ||
        prior.buyerSteamId !== op.order.buyer.steamId
      )
        return { result: 'ambiguous' as const };
      // Recover crash between proof persistence and order transition. Do not
      // require a released mapping lock or reconstruct the historical delta.
      const observed = buyer.assets.filter(
        (asset) => asset.assetId === prior.destinationAssetId,
      );
      if (observed.length > 1) return { result: 'ambiguous' as const };
      if (!observed.length) return { result: 'pending' as const };
      return mapInventoryDelivery(null, seller, buyer, op.expectedAssetId, {
        assetId: observed[0].assetId,
        contextId: observed[0].contextId,
      });
    }
    const mapped = mapInventoryDelivery(
      op.inventoryBaseline as InventoryBaseline | null,
      seller,
      buyer,
      op.expectedAssetId,
      verification.receivedAssetId && verification.receivedContextId
        ? {
            assetId: verification.receivedAssetId,
            contextId: verification.receivedContextId,
          }
        : undefined,
    );
    if (mapped.result !== 'confirmed' || !mapped.asset) return mapped;
    // Missing baseline is permitted ONLY for authoritative Steam receipt mapping.
    if (mapped.method === 'INVENTORY_DELTA') {
      const locks = await this.prisma.steamMappingLease.findMany({
        where: { orderId },
      });
      if (
        !locks.some((lock) => lock.steamId === op.order.seller.steamId) ||
        !locks.some((lock) => lock.steamId === op.order.buyer.steamId)
      )
        return { result: 'unknown' as const };
    }
    const verifiedAt = new Date();
    const proof = {
      version: DELIVERY_VERSION,
      orderId,
      offerId: op.externalOfferId,
      tradeId: verification.tradeId,
      sellerSteamId: op.order.seller.steamId,
      buyerSteamId: op.order.buyer.steamId,
      originalAssetId: op.expectedAssetId,
      destinationAssetId: mapped.asset.assetId,
      destinationContextId: mapped.asset.contextId,
      mappingMethod: mapped.method!,
      receiptStatus: 3,
      bindingVerified: verification.bindingVerified === true,
      offerState: 3,
      verifiedAt: verifiedAt.toISOString(),
      protectionUntil: new Date(
        verifiedAt.getTime() + PROTECTION_MS,
      ).toISOString(),
    };
    await this.prisma.tradeOperation.updateMany({
      where: {
        id: op.id,
        deliveryProof: { equals: Prisma.DbNull },
        status: 'WAITING',
      },
      data: { deliveryProof: proof, verificationStage: 'DELIVERY_VERIFIED' },
    });
    const stored = await this.prisma.tradeOperation.findUnique({
      where: { id: op.id },
    });
    const saved = stored?.deliveryProof as typeof proof | null;
    if (
      !saved ||
      saved.tradeId !== proof.tradeId ||
      saved.destinationAssetId !== proof.destinationAssetId ||
      saved.offerId !== proof.offerId
    )
      return { result: 'ambiguous' as const };
    this.logger.log(
      JSON.stringify({
        event:
          mapped.method === 'STEAM_RECEIPT'
            ? 'steam_destination_mapped_by_receipt'
            : 'steam_destination_mapped_by_inventory_delta',
        orderId,
      }),
    );
    await this.prisma.steamMappingLease.deleteMany({ where: { orderId } });
    return mapped;
  }
}
