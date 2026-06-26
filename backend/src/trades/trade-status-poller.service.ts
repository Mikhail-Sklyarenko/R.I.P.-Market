import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { OrderStatus, TradeOperationStatus } from '@prisma/client';
import { getProvidersConfig } from '../providers/config';
import { SteamTradeRateLimitError } from '../providers/trade/steam-trade.provider';
import { PrismaService } from '../prisma/prisma.service';
import { TradesService } from './trades.service';
import { TradeInventoryDeltaService } from './trade-inventory-delta.service';

const POLLABLE_MODES = new Set(['STEAM_POLL', 'SHADOW']);

function getTradeTimeoutMs(): number {
  const minutes = Number(process.env.TRADE_TIMEOUT_MINUTES ?? 60);
  return Number.isFinite(minutes) && minutes > 0 ? minutes * 60_000 : 3_600_000;
}

@Injectable()
export class TradeStatusPollerService {
  private readonly logger = new Logger(TradeStatusPollerService.name);
  private processing = false;
  private readonly backoffUntil = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly tradesService: TradesService,
    private readonly inventoryDelta: TradeInventoryDeltaService,
  ) {}

  @Interval(30_000)
  async handleInterval(): Promise<void> {
    if (
      process.env.JEST_WORKER_ID !== undefined ||
      process.env.ENABLE_TEST_ROUTES === 'true'
    ) {
      return;
    }
    if (getProvidersConfig().trade === 'mock') {
      return;
    }
    await this.pollWaitingTrades();
  }

  async pollWaitingTrades(): Promise<{ checked: number; transitions: number }> {
    if (this.processing) {
      return { checked: 0, transitions: 0 };
    }

    this.processing = true;
    let checked = 0;
    let transitions = 0;

    try {
      const operations = await this.prisma.tradeOperation.findMany({
        where: {
          status: TradeOperationStatus.WAITING,
          verificationMode: { in: [...POLLABLE_MODES] },
          order: { status: OrderStatus.WAITING_TRADE },
        },
        include: {
          order: {
            include: {
              lot: {
                include: {
                  inventoryAsset: { include: { itemDefinition: true } },
                },
              },
              buyer: { select: { id: true, steamId: true } },
              seller: { select: { id: true, steamId: true } },
            },
          },
        },
        take: 50,
      });

      for (const operation of operations) {
        const backoff = this.backoffUntil.get(operation.orderId);
        if (backoff && backoff > Date.now()) {
          continue;
        }

        checked += 1;
        const transitioned = await this.checkOperation(operation);
        if (transitioned) {
          transitions += 1;
        }
      }
    } finally {
      this.processing = false;
    }

    return { checked, transitions };
  }

  private async checkOperation(operation: {
    id: string;
    orderId: string;
    externalOfferId: string | null;
    expectedAssetId: string | null;
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
  }): Promise<boolean> {
    const timeoutAt = new Date(
      operation.order.createdAt.getTime() + getTradeTimeoutMs(),
    );

    try {
      if (new Date() >= timeoutAt) {
        await this.tradesService.applyTradeTimeout(operation.orderId, {
          idempotencyKey: `poll-timeout:${operation.orderId}`,
          auditAction: 'TRADE_POLL_TIMEOUT',
        });
        await this.recordPollEvent(operation.id, {
          outcome: 'TIMEOUT',
          strategy: 'TIMEOUT',
          offerStatus: null,
        });
        return true;
      }

      if (operation.externalOfferId) {
        return await this.checkOfferStatus(operation);
      }
      return await this.checkInventoryDelta(operation);
    } catch (error) {
      if (error instanceof SteamTradeRateLimitError) {
        const backoffMs = Number(process.env.TRADE_POLL_BACKOFF_MS ?? 120_000);
        this.backoffUntil.set(operation.orderId, Date.now() + backoffMs);
        await this.recordPollEvent(operation.id, {
          outcome: 'ERROR',
          strategy: operation.externalOfferId ? 'OFFER_POLL' : 'INVENTORY_DELTA',
          offerStatus: null,
          error: 'rate_limited',
        });
        this.logger.warn(
          `Steam 429 for order ${operation.orderId}, backing off ${backoffMs}ms`,
        );
        return false;
      }

      await this.recordPollEvent(operation.id, {
        outcome: 'ERROR',
        strategy: operation.externalOfferId ? 'OFFER_POLL' : 'INVENTORY_DELTA',
        offerStatus: null,
        error: error instanceof Error ? error.message : 'unknown',
      });
      return false;
    } finally {
      await this.prisma.tradeOperation.update({
        where: { id: operation.id },
        data: {
          lastCheckedAt: new Date(),
          checkCount: { increment: 1 },
        },
      });
    }
  }

  private async checkOfferStatus(operation: {
    id: string;
    orderId: string;
    externalOfferId: string | null;
  }): Promise<boolean> {
    const verification = await this.tradesService.verifyOffer(
      operation.externalOfferId!,
    );

    await this.recordPollEvent(operation.id, {
      outcome: 'NO_CHANGE',
      strategy: 'OFFER_POLL',
      offerStatus: verification.status,
    });

    if (verification.status === 'accepted') {
      await this.tradesService.applyTradeConfirmedFromPoll(operation.orderId);
      await this.recordPollEvent(operation.id, {
        outcome: 'CONFIRMED',
        strategy: 'OFFER_POLL',
        offerStatus: verification.status,
      });
      return true;
    }

    if (verification.status === 'declined' || verification.status === 'expired') {
      await this.tradesService.applyTradeFailedFromPoll(
        operation.orderId,
        verification.status,
      );
      await this.recordPollEvent(operation.id, {
        outcome:
          process.env.TRADE_FAIL_MODE === 'SAFE' ? 'FAILED_SAFE' : 'FAILED_DISPUTE',
        strategy: 'OFFER_POLL',
        offerStatus: verification.status,
      });
      return true;
    }

    return false;
  }

  private async checkInventoryDelta(operation: {
    id: string;
    orderId: string;
    expectedAssetId: string | null;
    order: {
      buyerId: string;
      sellerId: string;
      lot: {
        inventoryAsset: {
          assetExternalId: string;
          itemDefinition: { marketHashName: string };
        };
      };
      buyer: { id: string; steamId: string | null };
      seller: { id: string; steamId: string | null };
    };
  }): Promise<boolean> {
    const expected =
      operation.expectedAssetId ??
      operation.order.lot.inventoryAsset.assetExternalId;

    const result = await this.inventoryDelta.verify(
      operation.order.sellerId,
      operation.order.buyerId,
      operation.order.seller.steamId,
      operation.order.buyer.steamId,
      expected,
      operation.order.lot.inventoryAsset.itemDefinition.marketHashName,
    );

    await this.recordPollEvent(operation.id, {
      outcome: result === 'confirmed' ? 'CONFIRMED' : 'NO_CHANGE',
      strategy: 'INVENTORY_DELTA',
      offerStatus: result,
    });

    if (result === 'confirmed') {
      await this.tradesService.applyTradeConfirmedFromPoll(operation.orderId);
      return true;
    }

    return false;
  }

  private async recordPollEvent(
    tradeOperationId: string,
    params: {
      outcome: string;
      strategy: string;
      offerStatus: string | null;
      error?: string;
    },
  ) {
    await this.prisma.tradePollEvent.create({
      data: {
        tradeOperationId,
        outcome: params.outcome,
        strategy: params.strategy,
        offerStatus: params.offerStatus,
        error: params.error ?? null,
      },
    });
  }
}
