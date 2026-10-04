import { deliveryStreaks } from './verification-streaks';
import { DeliveryWorkflowService } from './delivery-workflow.service';
import { Prisma } from '@prisma/client';
import { Injectable, Logger } from '@nestjs/common';
import { SteamTradeRateLimitError } from '../providers/trade/steam-trade.provider';
import type { TradeVerificationResult } from '../providers/trade/trade-provider.interface';
import { PrismaService } from '../prisma/prisma.service';
import {
  computeRateLimitBackoffMs,
  getOfferUnknownMaxChecks,
  getInventoryUnknownMaxChecks,
  getAcceptedInventoryPendingMaxChecks,
  getTradeFailMode,
  getTradeTimeoutMs,
  isDeliveryVerificationEngineEnabled,
} from './delivery-verification.config';
import { decideDeliveryVerification } from './delivery-verification-decision';
import type {
  DeliveryVerificationDecision,
  DeliveryVerificationEvidence,
  DeliveryVerificationSignals,
} from './delivery-verification.types';
import {
  TradeInventoryDeltaService,
  InventoryVerificationRateLimitError,
  type InventoryDeltaResult,
} from './trade-inventory-delta.service';
import { TradesService } from './trades.service';

export type DeliveryVerificationOperation = {
  id: string;
  orderId: string;
  externalOfferId: string | null;
  expectedAssetId: string | null;
  verificationMode: string | null;
  tradeBinding?: string | null;
  checkCount: number;
  deliveryProof?: Prisma.JsonValue;
  order: {
    id: string;
    buyerId: string;
    sellerId: string;
    createdAt: Date;
    lot: {
      listingSnapshot?: {
        floatValue: number | null;
        paintSeed: number | null;
        marketHashName: string;
      } | null;
      inventoryAsset: {
        assetExternalId: string;
        floatValue: number | null;
        paintSeed: number | null;
        itemDefinition: { marketHashName: string };
      };
    };
    buyer: { id: string; steamId: string | null };
    seller: { id: string; steamId: string | null };
  };
};

@Injectable()
export class DeliveryVerificationEngineService {
  private readonly logger = new Logger(DeliveryVerificationEngineService.name);
  private readonly backoffUntil = new Map<string, number>();
  private readonly rateLimitHits = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly tradesService: TradesService,
    private readonly inventoryDelta: TradeInventoryDeltaService,
  ) {}

  isInBackoff(orderId: string): boolean {
    const until = this.backoffUntil.get(orderId);
    return until !== undefined && until > Date.now();
  }

  registerRateLimitBackoff(orderId: string): number {
    const hits = (this.rateLimitHits.get(orderId) ?? 0) + 1;
    this.rateLimitHits.set(orderId, hits);
    const delayMs = computeRateLimitBackoffMs(hits);
    this.backoffUntil.set(orderId, Date.now() + delayMs);
    this.logger.warn(
      JSON.stringify({
        event: 'delivery_verification_rate_limited',
        metric: 'delivery_verification_rate_limit_total',
        alert: hits >= 3,
        orderId,
        hits,
        delayMs,
      }),
    );
    return delayMs;
  }

  clearBackoff(orderId: string): void {
    this.backoffUntil.delete(orderId);
    this.rateLimitHits.delete(orderId);
  }

  async evaluate(operation: DeliveryVerificationOperation): Promise<{
    decision: DeliveryVerificationDecision;
    offerStatus: TradeVerificationResult['status'] | null;
    inventoryDelta: InventoryDeltaResult | null;
    evidence: DeliveryVerificationEvidence;
  }> {
    const timedOut =
      Date.now() >= operation.order.createdAt.getTime() + getTradeTimeoutMs();

    const buyerAckReceived = await this.hasBuyerAckReceived(operation.orderId);

    const signals: DeliveryVerificationSignals = {
      engineEnabled: isDeliveryVerificationEngineEnabled(),
      shadowMode: operation.verificationMode === 'SHADOW',
      hasOfferId: Boolean(operation.externalOfferId),
      offerStatus: null,
      inventoryDelta: null,
      buyerAckReceived,
      timedOut,
      rateLimited: false,
      checkCount: operation.checkCount,
      failMode: getTradeFailMode(),
    };

    const history = await this.prisma.tradePollEvent.findMany({
      where: {
        tradeOperationId: operation.id,
        OR: [
          { strategy: { startsWith: 'OFFER_POLL+' } },
          { strategy: { startsWith: 'INVENTORY_DELTA:' } },
        ],
      },
      orderBy: [{ checkedAt: 'desc' }, { id: 'desc' }],
      take: Math.ceil(
        Math.max(
          getOfferUnknownMaxChecks(),
          getInventoryUnknownMaxChecks(),
          getAcceptedInventoryPendingMaxChecks(),
        ),
      ),
      select: { strategy: true, offerStatus: true, outcome: true },
    });
    const previous = deliveryStreaks(history);
    const updateStreaks = () => {
      signals.offerUnknownStreak =
        signals.offerStatus === 'unknown' || signals.offerStatus === null
          ? previous.offerUnknownStreak + 1
          : 0;
      signals.inventoryUnknownStreak =
        signals.inventoryDelta === 'unknown'
          ? previous.inventoryUnknownStreak + 1
          : 0;
      signals.acceptedPendingStreak =
        signals.offerStatus === 'accepted'
          ? previous.acceptedPendingStreak + 1
          : 0;
    };
    const receiptDecision = async (verification?: TradeVerificationResult) => {
      const proof = await new DeliveryWorkflowService(this.prisma).verify(
        operation.orderId,
        verification,
      );
      if (proof.result === 'ambiguous') {
        return this.pack(
          {
            action: 'MANUAL_REVIEW',
            reason: 'DELIVERY_SIGNAL_CONFLICT',
            reasonCode: 'STEAM_EVIDENCE_CONFLICT',
            pollOutcome: 'MANUAL_REVIEW',
            offerStatus: verification?.status ?? null,
            inventoryDelta: null,
          },
          verification?.status ?? null,
          null,
        );
      }
      if (!proof.receiptProofPersisted) return null;
      this.logger.log(
        JSON.stringify({
          event: 'delivery_verified_by_receipt',
          orderId: operation.orderId,
        }),
      );
      signals.receiptProofPersisted = true;
      signals.offerStatus = verification?.status ?? null;
      signals.inventoryDelta = null;
      const packed = this.pack(
        decideDeliveryVerification(signals),
        signals.offerStatus,
        null,
      );
      packed.evidence.receiptProofPersisted = true;
      packed.evidence.deliveryAuthority = 'STEAM_RECEIPT';
      return packed;
    };
    let offerStatus: TradeVerificationResult['status'] | null = null;
    let inventoryDelta: InventoryDeltaResult | null = null;
    let receivedAssetId: string | undefined;
    let serverProof: TradeVerificationResult | undefined;
    let offerReasonCode: string | undefined;

    try {
      if (operation.externalOfferId) {
        const verification = await this.tradesService.verifyOffer(
          operation.externalOfferId,
          {
            ...(operation.tradeBinding
              ? { tradeBinding: operation.tradeBinding }
              : {}),
            sellerSteamId: operation.order.seller.steamId,
            buyerSteamId: operation.order.buyer.steamId,
            assetId:
              operation.expectedAssetId ??
              operation.order.lot.inventoryAsset.assetExternalId,
          },
        );
        serverProof = verification;
        if (verification.reversalDetected || verification.identityConflict) {
          const decision: DeliveryVerificationDecision = {
            action: verification.reversalDetected ? 'DISPUTE' : 'MANUAL_REVIEW',
            reason: 'DELIVERY_SIGNAL_CONFLICT',
            reasonCode: verification.reasonCode ?? 'STEAM_EVIDENCE_CONFLICT',
            pollOutcome: 'MANUAL_REVIEW',
            offerStatus: verification.status,
            inventoryDelta: null,
          };
          return this.pack(decision, verification.status, null);
        }
        if (verification.receiptVerified || verification.offerAccepted) {
          await this.prisma.tradeOperation.updateMany({
            where: {
              id: operation.id,
              status: 'WAITING',
              deliveryProof: { equals: Prisma.DbNull },
            },
            data: {
              verificationStage: verification.receiptVerified
                ? 'RECEIPT_VERIFIED'
                : 'OFFER_ACCEPTED',
            },
          });
        }
        offerStatus = verification.status;
        offerReasonCode = verification.reasonCode;
        if (verification.status === 'accepted')
          receivedAssetId = verification.receivedAssetId;
      }

      if (serverProof?.receiptVerified || operation.deliveryProof) {
        const receipt = await receiptDecision(serverProof);
        if (receipt) return receipt;
      }
      // Client DOM observations remain timeline evidence, never settlement authority.
      // Inventory remains an anomaly signal; it cannot replace durable receipt authority.
      {
        const expected =
          operation.expectedAssetId ??
          operation.order.lot.inventoryAsset.assetExternalId;
        const snapshot = operation.order.lot.listingSnapshot;
        const asset = operation.order.lot.inventoryAsset;
        inventoryDelta = await this.inventoryDelta.verify(
          operation.order.sellerId,
          operation.order.buyerId,
          operation.order.seller.steamId,
          operation.order.buyer.steamId,
          expected,
          snapshot?.marketHashName ?? asset.itemDefinition.marketHashName,
          {
            force: true,
            receivedAssetId,
            expectedFloatValue:
              snapshot?.floatValue ?? asset.floatValue ?? null,
            expectedPaintSeed: snapshot?.paintSeed ?? asset.paintSeed ?? null,
            orderCreatedAt: operation.order.createdAt,
          },
        );
      }

      signals.offerStatus = offerStatus;
      signals.inventoryDelta = inventoryDelta;

      updateStreaks();
      const decision = decideDeliveryVerification(signals);
      if (
        decision.action === 'WAIT' &&
        decision.reason === 'OFFER_UNKNOWN' &&
        offerReasonCode
      ) {
        decision.reasonCode = offerReasonCode;
      }
      return this.pack(decision, offerStatus, inventoryDelta);
    } catch (error: unknown) {
      if (
        operation.deliveryProof &&
        !serverProof?.identityConflict &&
        !serverProof?.reversalDetected
      ) {
        const receipt = await receiptDecision(serverProof);
        if (receipt) return receipt;
      }
      if (
        error instanceof SteamTradeRateLimitError ||
        error instanceof InventoryVerificationRateLimitError ||
        (error &&
          typeof error === 'object' &&
          'code' in error &&
          error.code === 'STEAM_RATE_LIMITED')
      ) {
        signals.rateLimited = true;
        const decision = decideDeliveryVerification(signals);
        return this.pack(decision, offerStatus, inventoryDelta);
      }
      // Transport/partial inventory failure is persisted retry/review, never a
      // user dispute or arbitrary upstream error text in financial logs.
      signals.offerStatus = offerStatus;
      signals.inventoryDelta = 'unknown';
      updateStreaks();
      const decision = decideDeliveryVerification(signals);
      return this.pack(decision, offerStatus, 'unknown');
    }
  }

  private async hasBuyerAckReceived(orderId: string): Promise<boolean> {
    const ack = await this.prisma.tradeAcknowledgment.findFirst({
      where: { orderId, type: 'BUYER_ACK_RECEIVED' },
      select: { id: true },
    });
    return ack !== null;
  }

  toEvidence(
    decision: DeliveryVerificationDecision,
    offerStatus: TradeVerificationResult['status'] | null,
    inventoryDelta: InventoryDeltaResult | null,
  ): DeliveryVerificationEvidence {
    return {
      offerStatus,
      inventoryDelta,
      reason: decision.reason,
      reasonCode: decision.reasonCode,
      engineEnabled: isDeliveryVerificationEngineEnabled(),
    };
  }

  private pack(
    decision: DeliveryVerificationDecision,
    offerStatus: TradeVerificationResult['status'] | null,
    inventoryDelta: InventoryDeltaResult | null,
  ) {
    return {
      decision,
      offerStatus,
      inventoryDelta,
      evidence: this.toEvidence(decision, offerStatus, inventoryDelta),
    };
  }
}
