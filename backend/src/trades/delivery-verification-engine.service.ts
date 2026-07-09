import { Injectable, Logger } from '@nestjs/common';
import { SteamTradeRateLimitError } from '../providers/trade/steam-trade.provider';
import type { TradeVerificationResult } from '../providers/trade/trade-provider.interface';
import {
  computeRateLimitBackoffMs,
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
import { isShadowVerificationMode } from './trade-verification.config';
import {
  TradeInventoryDeltaService,
  type InventoryDeltaResult,
} from './trade-inventory-delta.service';
import { TradesService } from './trades.service';

export type DeliveryVerificationOperation = {
  id: string;
  orderId: string;
  externalOfferId: string | null;
  expectedAssetId: string | null;
  verificationMode: string | null;
  checkCount: number;
  order: {
    id: string;
    buyerId: string;
    sellerId: string;
    createdAt: Date;
    lot: {
      inventoryAsset: {
        assetExternalId: string;
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

  async evaluate(
    operation: DeliveryVerificationOperation,
  ): Promise<{
    decision: DeliveryVerificationDecision;
    offerStatus: TradeVerificationResult['status'] | null;
    inventoryDelta: InventoryDeltaResult | null;
    evidence: DeliveryVerificationEvidence;
  }> {
    const timedOut =
      Date.now() >=
      operation.order.createdAt.getTime() + getTradeTimeoutMs();

    const signals: DeliveryVerificationSignals = {
      engineEnabled: isDeliveryVerificationEngineEnabled(),
      shadowMode: operation.verificationMode === 'SHADOW',
      hasOfferId: Boolean(operation.externalOfferId),
      offerStatus: null,
      inventoryDelta: null,
      timedOut,
      rateLimited: false,
      checkCount: operation.checkCount,
      failMode: getTradeFailMode(),
    };

    if (timedOut) {
      const decision = decideDeliveryVerification(signals);
      return this.pack(decision, null, null);
    }

    let offerStatus: TradeVerificationResult['status'] | null = null;
    let inventoryDelta: InventoryDeltaResult | null = null;

    try {
      if (operation.externalOfferId) {
        const verification = await this.tradesService.verifyOffer(
          operation.externalOfferId,
        );
        offerStatus = verification.status;
      }

      const shouldCheckInventory =
        isDeliveryVerificationEngineEnabled() || !operation.externalOfferId;
      if (shouldCheckInventory) {
        const expected =
          operation.expectedAssetId ??
          operation.order.lot.inventoryAsset.assetExternalId;
        inventoryDelta = await this.inventoryDelta.verify(
          operation.order.sellerId,
          operation.order.buyerId,
          operation.order.seller.steamId,
          operation.order.buyer.steamId,
          expected,
          operation.order.lot.inventoryAsset.itemDefinition.marketHashName,
        );
      }

      signals.offerStatus = offerStatus;
      signals.inventoryDelta = inventoryDelta;

      const decision = decideDeliveryVerification(signals);
      return this.pack(decision, offerStatus, inventoryDelta);
    } catch (error) {
      if (error instanceof SteamTradeRateLimitError) {
        signals.rateLimited = true;
        const decision = decideDeliveryVerification(signals);
        return this.pack(decision, offerStatus, inventoryDelta);
      }
      throw error;
    }
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
