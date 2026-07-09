import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { OrderStatus, TradeOperationStatus } from '@prisma/client';
import { getProvidersConfig } from '../providers/config';
import { SteamTradeRateLimitError } from '../providers/trade/steam-trade.provider';
import { PrismaService } from '../prisma/prisma.service';
import { ExtensionFlowMetricsService } from '../common/observability/extension-flow-metrics.service';
import {
  DeliveryVerificationEngineService,
  type DeliveryVerificationOperation,
} from './delivery-verification-engine.service';
import type { DeliveryVerificationEvidence } from './delivery-verification.types';
import { TradeShadowComparatorService } from './trade-shadow-comparator.service';
import { assertShadowModeConfig } from './trade-verification.config';
import { TradesService } from './trades.service';

const POLLABLE_MODES = new Set(['STEAM_POLL', 'SHADOW']);

@Injectable()
export class TradeStatusPollerService implements OnModuleInit {
  private readonly logger = new Logger(TradeStatusPollerService.name);
  private processing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tradesService: TradesService,
    private readonly deliveryEngine: DeliveryVerificationEngineService,
    private readonly shadowComparator: TradeShadowComparatorService,
    private readonly extensionFlowMetrics: ExtensionFlowMetricsService,
  ) {}

  onModuleInit(): void {
    assertShadowModeConfig();
  }

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
        if (this.deliveryEngine.isInBackoff(operation.orderId)) {
          continue;
        }

        checked += 1;
        const transitioned = await this.checkOperation(
          operation as DeliveryVerificationOperation,
        );
        if (transitioned) {
          transitions += 1;
        }
      }
    } finally {
      this.processing = false;
    }

    return { checked, transitions };
  }

  private async checkOperation(
    operation: DeliveryVerificationOperation,
  ): Promise<boolean> {
    const isShadow = operation.verificationMode === 'SHADOW';

    try {
      const evaluation = await this.deliveryEngine.evaluate(operation);
      const { decision, offerStatus, inventoryDelta, evidence } = evaluation;

      await this.recordPollEvent(operation.id, {
        outcome: decision.pollOutcome,
        strategy: operation.externalOfferId
          ? 'OFFER_POLL+INVENTORY_DELTA'
          : 'INVENTORY_DELTA',
        offerStatus: offerStatus ?? inventoryDelta,
        error:
          decision.action === 'BACKOFF' ? 'rate_limited' : undefined,
        reasonCode: decision.reasonCode,
      });

      if (isShadow) {
        await this.recordShadowSnapshot(operation, decision, evidence);
        return false;
      }

      switch (decision.action) {
        case 'BACKOFF': {
          this.deliveryEngine.registerRateLimitBackoff(operation.orderId);
          return false;
        }
        case 'WAIT':
          return false;
        case 'TIMEOUT': {
          await this.tradesService.applyTradeTimeout(operation.orderId, {
            idempotencyKey: `poll-timeout:${operation.orderId}`,
            auditAction: 'TRADE_POLL_TIMEOUT',
          });
          return true;
        }
        case 'CONFIRM': {
          this.deliveryEngine.clearBackoff(operation.orderId);
          await this.tradesService.applyTradeConfirmedFromPoll(
            operation.orderId,
            evidence,
          );
          return true;
        }
        case 'FAIL': {
          this.deliveryEngine.clearBackoff(operation.orderId);
          await this.tradesService.applyTradeFailedFromPoll(
            operation.orderId,
            decision.reasonCode,
          );
          return true;
        }
        case 'DISPUTE': {
          this.deliveryEngine.clearBackoff(operation.orderId);
          this.extensionFlowMetrics.recordVerifyMismatch({
            orderId: operation.orderId,
            reasonCode: decision.reasonCode,
            source: 'delivery_engine',
          });
          if (
            decision.reason === 'OFFER_UNKNOWN' ||
            decision.reason === 'DELIVERY_VERIFICATION_UNKNOWN' ||
            decision.reason === 'INVENTORY_UNKNOWN_EXHAUSTED'
          ) {
            await this.tradesService.applyUnknownTradeStateFromPoll(
              operation.orderId,
              decision.reasonCode,
            );
          } else {
            await this.tradesService.applyTradeFailedFromPoll(
              operation.orderId,
              decision.reasonCode,
            );
          }
          return true;
        }
        default:
          return false;
      }
    } catch (error) {
      if (error instanceof SteamTradeRateLimitError) {
        const delayMs = this.deliveryEngine.registerRateLimitBackoff(
          operation.orderId,
        );
        await this.recordPollEvent(operation.id, {
          outcome: 'ERROR',
          strategy: operation.externalOfferId
            ? 'OFFER_POLL+INVENTORY_DELTA'
            : 'INVENTORY_DELTA',
          offerStatus: null,
          error: 'rate_limited',
          reasonCode: 'RATE_LIMITED',
        });
        this.logger.warn(
          `Steam 429 for order ${operation.orderId}, backing off ${delayMs}ms`,
        );
        return false;
      }

      await this.recordPollEvent(operation.id, {
        outcome: 'ERROR',
        strategy: operation.externalOfferId
          ? 'OFFER_POLL+INVENTORY_DELTA'
          : 'INVENTORY_DELTA',
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

  private async recordShadowSnapshot(
    operation: DeliveryVerificationOperation,
    decision: { action: string; reasonCode: string },
    evidence: DeliveryVerificationEvidence,
  ) {
    const observedStatus =
      evidence.offerStatus ??
      (evidence.inventoryDelta === 'confirmed' ? 'accepted' : 'pending');
    await this.shadowComparator.recordSnapshot({
      orderId: operation.orderId,
      source: 'STEAM_POLL',
      observedStatus,
      payload: {
        strategy: 'DELIVERY_VERIFICATION_ENGINE',
        decision: decision.action,
        reasonCode: decision.reasonCode,
        evidence,
      },
    });
  }

  private async recordPollEvent(
    tradeOperationId: string,
    params: {
      outcome: string;
      strategy: string;
      offerStatus: string | null;
      error?: string;
      reasonCode?: string;
    },
  ) {
    await this.prisma.tradePollEvent.create({
      data: {
        tradeOperationId,
        outcome: params.outcome,
        strategy: params.strategy,
        offerStatus: params.offerStatus,
        error: params.error ?? params.reasonCode ?? null,
      },
    });
  }
}
