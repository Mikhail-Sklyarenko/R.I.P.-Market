import { boundDeliveryProof } from '../trades/durable-delivery-proof';
import { proofDeadline, supportsProofWindow } from './settlement-proof-policy';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  LedgerEntryType,
  OrderStatus,
  Prisma,
  TradeOperationStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { isLiveVerificationMode } from '../trades/trade-verification.config';
import {
  getEnvAllowlistSteamIds,
  getMaxDailyOrders,
  getMaxDailyVolumeMinor,
  getMaxOrderMinor,
  isRealSettlementEnabled,
  isSettlementOpenRollout,
  isProofWindowSettlement,
  getAutoSettlementMaxOrderMinor,
  getAutoSettlementMaxExposureMinor,
  utcDayKey,
} from './settlement.config';
import type {
  SettlementGuardResult,
  SettlementBlockCode,
} from './settlement.types';
import { TRADE_PROVIDER } from '../providers/tokens';
import type { TradeProvider } from '../providers/trade/trade-provider.interface';

export type SettlementOrderContext = {
  id: string;
  status: OrderStatus;
  amountMinor: bigint;
  buyer: { steamId: string | null };
  seller: { steamId: string | null };
  tradeOperation: { status: TradeOperationStatus } | null;
};

@Injectable()
export class SettlementGuardService {
  private readonly logger = new Logger(SettlementGuardService.name);
  constructor(
    private readonly prisma: PrismaService,
    @Inject(TRADE_PROVIDER) private readonly tradeProvider: TradeProvider,
  ) {}

  async canSettle(
    order: SettlementOrderContext,
    tx?: Prisma.TransactionClient,
  ): Promise<SettlementGuardResult> {
    if (!isRealSettlementEnabled()) {
      return blocked(
        'REAL_SETTLEMENT_DISABLED',
        'Real settlement is disabled (ENABLE_REAL_SETTLEMENT=false)',
      );
    }

    if (!isLiveVerificationMode()) {
      return blocked(
        'NOT_LIVE_MODE',
        'Real settlement requires TRADE_VERIFICATION_MODE=live',
      );
    }

    if (!order.tradeOperation) {
      return blocked('TRADE_NOT_CONFIRMED', 'Trade operation is missing');
    }

    const deliveryVerified =
      order.tradeOperation.status === TradeOperationStatus.DELIVERY_VERIFIED ||
      order.tradeOperation.status === TradeOperationStatus.CONFIRMED;
    if (!deliveryVerified) {
      return blocked(
        'TRADE_NOT_CONFIRMED',
        `Trade operation status is ${order.tradeOperation.status}, expected DELIVERY_VERIFIED`,
      );
    }

    if (
      order.status !== OrderStatus.TRADE_CONFIRMED &&
      order.status !== OrderStatus.SETTLEMENT_HOLD
    ) {
      return blocked(
        'ORDER_NOT_TRADE_CONFIRMED',
        `Order status is ${order.status}, expected TRADE_CONFIRMED or SETTLEMENT_HOLD`,
      );
    }

    const buyerSteamId = order.buyer.steamId;
    if (!buyerSteamId) {
      return blocked('MISSING_BUYER_STEAM_ID', 'Buyer has no linked Steam ID');
    }

    const sellerSteamId = order.seller.steamId;
    if (!sellerSteamId) {
      return blocked(
        'MISSING_SELLER_STEAM_ID',
        'Seller has no linked Steam ID',
      );
    }

    const buyerAllow = await this.resolveAllowlistEntry(buyerSteamId, tx);
    if (!buyerAllow.allowed) {
      return blocked(
        'BUYER_NOT_ALLOWLISTED',
        'Buyer Steam ID is not on the settlement allowlist',
      );
    }

    const sellerAllow = await this.resolveAllowlistEntry(sellerSteamId, tx);
    if (!sellerAllow.allowed) {
      return blocked(
        'SELLER_NOT_ALLOWLISTED',
        'Seller Steam ID is not on the settlement allowlist',
      );
    }

    const maxOrderMinor = this.effectiveMaxOrderMinor(
      buyerAllow.maxOrderMinor,
      sellerAllow.maxOrderMinor,
    );
    if (order.amountMinor <= 0n || order.amountMinor > maxOrderMinor) {
      return blocked(
        'ORDER_AMOUNT_EXCEEDS_LIMIT',
        `Order amount ${order.amountMinor.toString()} exceeds limit ${maxOrderMinor.toString()}`,
      );
    }

    const db = tx ?? this.prisma;
    const alreadySettled = await db.ledgerEntry.findFirst({
      where: { orderId: order.id, type: LedgerEntryType.SETTLEMENT_SELLER },
      select: { id: true },
    });
    if (alreadySettled)
      return blocked(
        'SETTLEMENT_FINANCIAL_INCONSISTENCY',
        'Settlement entry already exists before completion',
      );

    const day = utcDayKey();
    const stats = await db.settlementDailyStats.findUnique({ where: { day } });
    const orderCount = stats?.orderCount ?? 0;
    const volumeMinor = stats?.volumeMinor ?? 0n;

    if (orderCount >= getMaxDailyOrders()) {
      return blocked(
        'DAILY_ORDER_LIMIT',
        `Daily settlement order limit (${getMaxDailyOrders()}) reached`,
      );
    }

    const maxDailyVolume = getMaxDailyVolumeMinor();
    if (volumeMinor + order.amountMinor > maxDailyVolume) {
      return blocked(
        'DAILY_VOLUME_LIMIT',
        `Daily settlement volume would exceed limit ${maxDailyVolume.toString()}`,
      );
    }

    // A historical DELIVERY_VERIFIED row is not proof that Steam has not
    // reversed the trade during the hold. Both settlement entry points use
    // this guard, so neither the worker nor a manual retry can skip this read.
    if (order.status === OrderStatus.SETTLEMENT_HOLD) {
      try {
        const operation = await db.tradeOperation.findUnique({
          where: { orderId: order.id },
          select: {
            externalOfferId: true,
            expectedAssetId: true,
            deliveryProof: true,
            tradeBinding: true,
            verificationStage: true,
            failReasonCode: true,
          },
        });
        const anchors = {
          orderId: order.id,
          offerId: operation?.externalOfferId ?? '',
          originalAssetId: operation?.expectedAssetId ?? '',
          sellerSteamId,
          buyerSteamId,
          tradeBinding: operation?.tradeBinding,
        };
        const stored = boundDeliveryProof(operation?.deliveryProof, anchors);
        if (
          operation?.verificationStage === 'MANUAL_REVIEW' ||
          (operation?.failReasonCode &&
            operation.failReasonCode !== 'STEAM_RECHECK_UNAVAILABLE')
        )
          return blocked(
            'SETTLEMENT_REVIEW_REQUIRED',
            'Recorded delivery conflict requires review',
          );
        const recordedConflict = await db.tradePollEvent.findFirst({
          where: {
            tradeOperation: { orderId: order.id },
            OR: [
              { error: { contains: 'REVERS' } },
              { error: { contains: 'CONFLICT' } },
              { error: { contains: 'MISMATCH' } },
            ],
          },
          select: { id: true },
        });
        if (recordedConflict)
          return blocked(
            'SETTLEMENT_REVIEW_REQUIRED',
            'Recorded conflict cannot be cleared by an expired timer',
          );
        const financial = await db.hold.findUnique({
          where: { orderId: order.id },
          include: { order: { include: { lot: true } } },
        });
        const reserve = await db.ledgerEntry.aggregate({
          where: { holdId: financial?.id ?? '', type: 'HOLD_RESERVE' },
          _sum: { amountMinor: true },
        });
        if (
          !financial ||
          financial.amountMinor !== order.amountMinor ||
          financial.order.holdAmountMinor !== order.amountMinor ||
          financial.capturedMinor !== 0n ||
          financial.releasedMinor !== 0n ||
          financial.settlementReleasedAt ||
          financial.order.lot.sellerReceiveMinor < 0n ||
          financial.order.lot.commissionMinor < 0n ||
          financial.order.lot.sellerReceiveMinor +
            financial.order.lot.commissionMinor !==
            order.amountMinor ||
          reserve._sum.amountMinor !== -order.amountMinor
        )
          return blocked(
            'SETTLEMENT_FINANCIAL_INCONSISTENCY',
            'Hold, ledger and order amounts must agree',
          );
        const deadline = proofDeadline(operation?.deliveryProof, anchors);
        if (!stored || deadline === null)
          return blocked(
            'STEAM_RECHECK_UNAVAILABLE',
            'Bound receipt and elapsed protection are required',
          );
        if (deadline > Date.now())
          return blocked(
            'SETTLEMENT_PROTECTION_ACTIVE',
            'Canonical proof protection has not elapsed',
          );
        if (
          isProofWindowSettlement() &&
          supportsProofWindow(operation?.deliveryProof, anchors)
        ) {
          const maxOrder = getAutoSettlementMaxOrderMinor();
          const maxExposure = getAutoSettlementMaxExposureMinor();
          // Conservatively count every unpaid protection hold, including review.
          // SettlementService serializes this read and release with a DB lock.
          const exposure = await db.order.aggregate({
            where: {
              status: {
                in: [OrderStatus.SETTLEMENT_HOLD, OrderStatus.DISPUTE],
              },
              hold: {
                settlementReleasedAt: null,
                capturedMinor: 0n,
                releasedMinor: 0n,
              },
            },
            _sum: { amountMinor: true },
          });
          if (
            maxOrder <= 0n ||
            maxExposure <= 0n ||
            order.amountMinor > maxOrder ||
            (exposure._sum.amountMinor ?? 0n) > maxExposure
          )
            return blocked(
              'AUTO_SETTLEMENT_RISK_LIMIT',
              'Explicit automatic settlement risk budget is missing or exceeded',
            );
          this.logger.log(
            JSON.stringify({
              event: 'settlement_proof_window_eligible',
              orderId: order.id,
              policy: 'proof_window',
            }),
          );
          return { allowed: true };
        }
        if (!this.tradeProvider.verifyTradeReceipt)
          return blocked(
            'STEAM_RECHECK_UNAVAILABLE',
            'Fresh Steam receipt reader unavailable',
          );
        this.logger.log(
          JSON.stringify({
            event: 'settlement_protection_recheck',
            orderId: order.id,
          }),
        );
        const proof = await this.tradeProvider.verifyTradeReceipt(
          stored.tradeId,
          stored.offerId,
          {
            sellerSteamId,
            buyerSteamId,
            assetId: stored.originalAssetId,
            ...(operation?.tradeBinding
              ? { tradeBinding: operation.tradeBinding }
              : {}),
          },
        );
        if (proof.reversalDetected) {
          this.logger.warn(
            JSON.stringify({
              event: 'steam_trade_reversal_detected',
              orderId: order.id,
            }),
          );
          return blocked(
            'STEAM_REVERSAL_DETECTED',
            'Steam reported a reversal; held funds require review',
          );
        }
        if (
          proof.status !== 'accepted' ||
          !proof.receiptVerified ||
          proof.identityConflict ||
          proof.tradeId !== stored.tradeId
        )
          return blocked(
            'STEAM_RECHECK_UNAVAILABLE',
            'Steam has not reconfirmed the bound receipt',
          );
      } catch {
        this.logger.warn(
          JSON.stringify({
            event: 'settlement_protection_recheck_unavailable',
            orderId: order.id,
          }),
        );
        // Authenticated transport errors can contain credentials. Neither
        // expose nor persist their text; leave the money held for retry/review.
        return blocked(
          'STEAM_RECHECK_UNAVAILABLE',
          'Fresh Steam settlement evidence is unavailable',
        );
      }
    }

    return { allowed: true };
  }

  async isSteamIdAllowlisted(steamId: string): Promise<boolean> {
    const entry = await this.resolveAllowlistEntry(steamId);
    return entry.allowed;
  }

  private async resolveAllowlistEntry(
    steamId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<{ allowed: boolean; maxOrderMinor?: bigint | null }> {
    if (isSettlementOpenRollout()) return { allowed: true };
    if (getEnvAllowlistSteamIds().has(steamId)) {
      return { allowed: true, maxOrderMinor: null };
    }

    const db = tx ?? this.prisma;
    const entry = await db.settlementAllowlistEntry.findUnique({
      where: { steamId },
    });
    if (!entry || !entry.enabled) {
      return { allowed: false };
    }
    return { allowed: true, maxOrderMinor: entry.maxOrderMinor };
  }

  private effectiveMaxOrderMinor(
    buyerMax: bigint | null | undefined,
    sellerMax: bigint | null | undefined,
  ): bigint {
    let limit = getMaxOrderMinor();
    for (const candidate of [buyerMax, sellerMax]) {
      if (candidate !== null && candidate !== undefined && candidate < limit) {
        limit = candidate;
      }
    }
    return limit;
  }
}

function blocked(
  code: SettlementBlockCode,
  reason: string,
): SettlementGuardResult {
  return { allowed: false, code, reason };
}
