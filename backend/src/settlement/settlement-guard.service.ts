import { Injectable } from '@nestjs/common';
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
  utcDayKey,
} from './settlement.config';
import type { SettlementGuardResult, SettlementBlockCode } from './settlement.types';

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
  constructor(private readonly prisma: PrismaService) {}

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

    if (order.tradeOperation.status !== TradeOperationStatus.CONFIRMED) {
      return blocked(
        'TRADE_NOT_CONFIRMED',
        `Trade operation status is ${order.tradeOperation.status}, expected CONFIRMED`,
      );
    }

    if (order.status !== OrderStatus.TRADE_CONFIRMED) {
      return blocked(
        'ORDER_NOT_TRADE_CONFIRMED',
        `Order status is ${order.status}, expected TRADE_CONFIRMED`,
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
    if (order.amountMinor > maxOrderMinor) {
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
    if (alreadySettled) {
      return { allowed: true };
    }

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

function blocked(code: SettlementBlockCode, reason: string): SettlementGuardResult {
  return { allowed: false, code, reason };
}
