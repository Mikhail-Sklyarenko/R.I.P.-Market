import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  observeSteamInventory,
  type InventoryBaseline,
} from './inventory-observation';
import type { TradeVerificationResult } from '../providers/trade/trade-provider.interface';

import {
  boundDeliveryProof,
  DELIVERY_VERSION,
  steamNumericId,
} from './durable-delivery-proof';
import {
  getSteamProtectionMs,
  MIN_STEAM_PROTECTION_MS,
} from '../settlement/settlement-hold.config';
export { DELIVERY_VERSION } from './durable-delivery-proof';
export const PROTECTION_MS = MIN_STEAM_PROTECTION_MS;
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

  async verify(orderId: string, verification?: TradeVerificationResult) {
    const unknown = { result: null, receiptProofPersisted: false } as const;
    const conflict = () => {
      this.logger.warn(
        JSON.stringify({ event: 'delivery_receipt_conflict', orderId }),
      );
      return { result: 'ambiguous', receiptProofPersisted: false } as const;
    };
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
      return unknown;
    const anchors = {
      orderId,
      offerId: op.externalOfferId,
      originalAssetId: op.expectedAssetId,
      sellerSteamId: op.order.seller.steamId,
      buyerSteamId: op.order.buyer.steamId,
      tradeBinding: op.tradeBinding,
    };
    if (verification?.identityConflict || verification?.reversalDetected)
      return conflict();
    if (op.deliveryProof) {
      const prior = boundDeliveryProof(op.deliveryProof, anchors);
      if (
        !prior ||
        (verification &&
          ['declined', 'expired', 'pending', 'needs_confirmation'].includes(
            verification.status,
          )) ||
        (verification?.tradeId && verification.tradeId !== prior.tradeId) ||
        (verification?.receiptVerified &&
          op.tradeBinding &&
          !verification.bindingVerified)
      )
        return conflict();
      // No inventory or old offer dependency after persistence, including crash recovery.
      await this.prisma.steamMappingLease.deleteMany({ where: { orderId } });
      this.logger.log(
        JSON.stringify({ event: 'delivery_receipt_reused', orderId }),
      );
      return {
        result: null,
        receiptProofPersisted: true,
        deliveryAuthority: 'STEAM_RECEIPT',
      } as const;
    }
    if (
      verification?.status !== 'accepted' ||
      !verification.receiptVerified ||
      !steamNumericId(verification.tradeId) ||
      (op.tradeBinding && verification.bindingVerified !== true)
    )
      return unknown;
    // Never reconstruct BEFORE after sending. New flows must retain the original baseline.
    const baseline = op.inventoryBaseline as InventoryBaseline | null;
    if (
      !baseline ||
      baseline.original.assetId !== op.expectedAssetId ||
      baseline.original.contextId !== '2' ||
      baseline.original.appId !== 730
    )
      return conflict();
    const verifiedAt = new Date();
    const mapped =
      steamNumericId(verification.receivedAssetId) &&
      ['2', '16'].includes(verification.receivedContextId ?? '');
    const proof = {
      version: DELIVERY_VERSION,
      authority: 'STEAM_RECEIPT',
      orderId,
      offerId: op.externalOfferId,
      tradeId: verification.tradeId,
      sellerSteamId: op.order.seller.steamId,
      buyerSteamId: op.order.buyer.steamId,
      originalAssetId: op.expectedAssetId,
      receiptStatus: 3,
      offerState: 3,
      bindingVerified: verification.bindingVerified === true,
      ...(op.tradeBinding ? { tradeBinding: op.tradeBinding } : {}),
      verifiedAt: verifiedAt.toISOString(),
      protectionUntil: new Date(
        verifiedAt.getTime() + getSteamProtectionMs(),
      ).toISOString(),
      ...(mapped
        ? {
            destinationAssetId: verification.receivedAssetId!,
            destinationContextId: verification.receivedContextId!,
            mappingMethod: 'STEAM_RECEIPT',
          }
        : {}),
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
    const saved = boundDeliveryProof(stored?.deliveryProof, anchors);
    if (!saved || saved.tradeId !== proof.tradeId) return conflict();
    this.logger.log(
      JSON.stringify({ event: 'steam_receipt_authority_persisted', orderId }),
    );
    if (!mapped)
      this.logger.log(
        JSON.stringify({
          event: 'steam_destination_mapping_deferred',
          orderId,
        }),
      );
    // This completed transfer no longer uses a delta window. No future inventory delta
    // alone may authorize delivery; a separate exact receipt is required for each order.
    await this.prisma.steamMappingLease.deleteMany({ where: { orderId } });
    return {
      result: null,
      receiptProofPersisted: true,
      deliveryAuthority: 'STEAM_RECEIPT',
    } as const;
  }
}
