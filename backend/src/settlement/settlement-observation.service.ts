import { Inject, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TRADE_PROVIDER } from '../providers/tokens';
import type { TradeProvider } from '../providers/trade/trade-provider.interface';
import { boundDeliveryProof } from '../trades/durable-delivery-proof';
import {
  observeSteamInventory,
  strongFingerprintMatches,
  mapInventoryDelivery,
  type InventoryBaseline,
} from '../trades/inventory-observation';
import { proofDeadline } from './settlement-proof-policy';

/** Optional observations never replace or rewrite the authoritative receipt. */
@Injectable()
export class SettlementObservationService {
  private readonly logger = new Logger(SettlementObservationService.name);
  constructor(
    private readonly prisma: PrismaService,
    @Inject(TRADE_PROVIDER) private readonly provider: TradeProvider,
  ) {}

  // Caller holds the order lock. Release uses the same lock before checking signals.
  async observe(orderId: string, tx: Prisma.TransactionClient): Promise<void> {
    const op = await tx.tradeOperation.findUnique({
      where: { orderId },
      include: { order: { include: { buyer: true, seller: true } } },
    });
    if (
      !op ||
      op.order.status !== OrderStatus.SETTLEMENT_HOLD ||
      op.verificationStage === 'MANUAL_REVIEW'
    )
      return;
    const anchors = {
      orderId,
      offerId: op.externalOfferId ?? '',
      originalAssetId: op.expectedAssetId ?? '',
      sellerSteamId: op.order.seller.steamId ?? '',
      buyerSteamId: op.order.buyer.steamId ?? '',
      tradeBinding: op.tradeBinding,
    };
    const proof = boundDeliveryProof(op.deliveryProof, anchors);
    if (!proof || proofDeadline(proof, anchors) === null) return;
    let contradiction: string | null = null;
    let receiptObservation = 'UNAVAILABLE';
    try {
      const result = await this.provider.verifyTradeReceipt?.(
        proof.tradeId,
        proof.offerId,
        {
          sellerSteamId: proof.sellerSteamId,
          buyerSteamId: proof.buyerSteamId,
          assetId: proof.originalAssetId,
          tradeBinding: op.tradeBinding ?? undefined,
        },
      );
      if (result?.reversalDetected) contradiction = 'STEAM_REVERSAL_DETECTED';
      else if (
        result?.identityConflict ||
        (result?.tradeId && result.tradeId !== proof.tradeId)
      )
        contradiction = 'STEAM_IDENTITY_CONFLICT';
      receiptObservation =
        contradiction ??
        (result?.receiptVerified ? 'RECEIPT_OBSERVED' : 'UNAVAILABLE');
    } catch {
      /* Never record transport text: it may contain credentials. */
    }
    const baseline = op.inventoryBaseline as InventoryBaseline | null;
    if (
      baseline?.original?.assetId === proof.originalAssetId &&
      baseline.seller?.assets &&
      baseline.buyer?.assets
    ) {
      try {
        const seller = await observeSteamInventory(proof.sellerSteamId);
        const prior = new Set(
          baseline.seller.assets
            .filter((a) => a.assetId !== proof.originalAssetId)
            .map((a) => a.assetId),
        );
        if (
          Date.parse(seller.fetchedAt) > Date.parse(proof.verifiedAt) &&
          seller.assets.some(
            (a) =>
              !prior.has(a.assetId) &&
              strongFingerprintMatches(baseline.original, a),
          )
        )
          contradiction = 'REVERSAL_SUSPECTED';
        // An inaccessible protected buyer inventory is not contradictory evidence.
        if (!contradiction) {
          const buyer = await observeSteamInventory(proof.buyerSteamId);
          const mapped = mapInventoryDelivery(
            baseline,
            seller,
            buyer,
            proof.originalAssetId,
          );
          if (
            mapped.result === 'confirmed' &&
            mapped.asset &&
            Date.parse(buyer.fetchedAt) > Date.parse(proof.verifiedAt)
          ) {
            const existing = await tx.tradeVerificationSnapshot.findFirst({
              where: { orderId, source: 'SETTLEMENT_SUPPLEMENTARY_MAPPING' },
            });
            if (!existing)
              await tx.tradeVerificationSnapshot.create({
                data: {
                  orderId,
                  source: 'SETTLEMENT_SUPPLEMENTARY_MAPPING',
                  observedStatus: 'UNIQUE_INVENTORY_DELTA',
                  match: true,
                  payload: {
                    offerId: proof.offerId,
                    tradeId: proof.tradeId,
                    assetId: mapped.asset.assetId,
                    contextId: mapped.asset.contextId,
                    fetchedAt: buyer.fetchedAt,
                  },
                },
              });
          }
        }
      } catch {
        /* Incomplete/private/rate-limited inventory is absence of observation. */
      }
    }
    await tx.tradePollEvent.create({
      data: {
        tradeOperationId: op.id,
        strategy: 'SETTLEMENT_OPTIONAL_OBSERVATION',
        outcome: contradiction ? 'BLOCKED' : receiptObservation,
        error: contradiction,
      },
    });
    await tx.tradeOperation.update({
      where: { id: op.id },
      data: {
        lastCheckedAt: new Date(),
        ...(contradiction
          ? {
              verificationStage: 'MANUAL_REVIEW',
              failReasonCode: contradiction,
            }
          : {}),
      },
    });
  }

  @Interval(60_000)
  async handleInterval(): Promise<void> {
    if (
      process.env.JEST_WORKER_ID !== undefined ||
      process.env.ENABLE_TEST_ROUTES === 'true'
    )
      return;
    const orders = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.SETTLEMENT_HOLD,
        tradeOperation: {
          verificationStage: { not: 'MANUAL_REVIEW' },
          OR: [
            { lastCheckedAt: null },
            { lastCheckedAt: { lt: new Date(Date.now() - 3600000) } },
          ],
        },
      },
      select: { id: true },
      take: 20,
      orderBy: { updatedAt: 'asc' },
    });
    for (const order of orders) {
      try {
        await this.prisma.$transaction(
          async (tx) => {
            await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext('settlement-daily-budget'))`;
            await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${order.id} FOR UPDATE`;
            await this.observe(order.id, tx);
          },
          { timeout: 60000 },
        );
      } catch {
        this.logger.warn('SETTLEMENT_OPTIONAL_OBSERVATION_UNAVAILABLE');
      }
    }
  }
}
