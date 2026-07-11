import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { OrderStatus, TradeTaskStatus } from '@prisma/client';
import { getAuditContext } from '../common/observability/audit-context';
import { PrismaService } from '../prisma/prisma.service';
import { isExtensionTaskPipelineEnabled } from './extension-task.config';
import {
  type ExtensionRolloutStage,
  getExtensionRolloutEnvAllowlistSteamIds,
  getExtensionRolloutInternalSteamIds,
  getExtensionRolloutInternalUserIds,
  getExtensionRolloutPercent,
  getExtensionRolloutStage,
  isExtensionRolloutEnabled,
  isExtensionRolloutInflightGraceEnabled,
  isExtensionRolloutKillSwitchActive,
  snapshotExtensionFeatureFlags,
} from './extension-rollout.config';

export type ExtensionRolloutDecisionReason =
  | 'rollout_gating_disabled'
  | 'pipeline_disabled'
  | 'kill_switch'
  | 'stage_off'
  | 'internal_match'
  | 'allowlist_match'
  | 'percent_match'
  | 'percent_excluded'
  | 'not_internal'
  | 'not_allowlisted'
  | 'missing_seller_steam_id';

export type ExtensionRolloutDecision = {
  eligible: boolean;
  reason: ExtensionRolloutDecisionReason;
  stage: ExtensionRolloutStage;
};

const ACTIVE_TASK_STATUSES: TradeTaskStatus[] = [
  TradeTaskStatus.CREATED,
  TradeTaskStatus.DISPATCHED,
  TradeTaskStatus.ACKED,
];

@Injectable()
export class ExtensionRolloutService {
  private readonly logger = new Logger(ExtensionRolloutService.name);

  constructor(private readonly prisma: PrismaService) {}

  async shouldCreateExtensionTaskForSeller(
    sellerId: string,
    sellerSteamId?: string | null,
  ): Promise<ExtensionRolloutDecision> {
    const stage = getExtensionRolloutStage();

    if (!isExtensionTaskPipelineEnabled()) {
      return { eligible: false, reason: 'pipeline_disabled', stage };
    }

    if (!isExtensionRolloutEnabled()) {
      return { eligible: true, reason: 'rollout_gating_disabled', stage };
    }

    if (isExtensionRolloutKillSwitchActive()) {
      return { eligible: false, reason: 'kill_switch', stage };
    }

    if (stage === 'off') {
      return { eligible: false, reason: 'stage_off', stage };
    }

    const steamId = sellerSteamId ?? (await this.lookupSellerSteamId(sellerId));
    const decision = await this.evaluateStage(stage, sellerId, steamId);
    this.logDecision('extension_rollout_seller_check', sellerId, decision, {
      steamId,
    });
    return decision;
  }

  async hasInflightExtensionGrace(orderId: string): Promise<boolean> {
    if (!isExtensionRolloutInflightGraceEnabled()) {
      return false;
    }
    if (!isExtensionRolloutKillSwitchActive()) {
      return false;
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { status: true },
    });
    if (!order || order.status !== OrderStatus.WAITING_TRADE) {
      return false;
    }

    const activeTask = await this.prisma.tradeTask.findFirst({
      where: {
        orderId,
        status: { in: ACTIVE_TASK_STATUSES },
      },
      select: { id: true },
    });
    return activeTask !== null;
  }

  async getOpsSnapshot() {
    const dbAllowlist =
      await this.prisma.extensionRolloutAllowlistEntry.findMany({
        orderBy: { createdAt: 'desc' },
      });

    return {
      enabled: isExtensionRolloutEnabled(),
      killSwitch: isExtensionRolloutKillSwitchActive(),
      inflightGrace: isExtensionRolloutInflightGraceEnabled(),
      stage: getExtensionRolloutStage(),
      percent: getExtensionRolloutPercent(),
      featureFlags: snapshotExtensionFeatureFlags(),
      internal: {
        userIds: [...getExtensionRolloutInternalUserIds()],
        steamIds: [...getExtensionRolloutInternalSteamIds()],
      },
      allowlist: {
        envSteamIds: [...getExtensionRolloutEnvAllowlistSteamIds()],
        entries: dbAllowlist,
      },
      rollback: {
        targetMinutes: 10,
        layers: [
          'EXTENSION_ROLLOUT_KILL_SWITCH=true',
          'ENABLE_EXTENSION_OFFER_ORCHESTRATOR=false',
          'ENABLE_EXTENSION_TASK_PIPELINE=false (optional, breaks new tasks)',
          'ENABLE_EXTENSION_CHANNEL=false (nuclear, in-flight extension stops)',
        ],
      },
      timestamp: new Date().toISOString(),
    };
  }

  private async evaluateStage(
    stage: ExtensionRolloutStage,
    sellerId: string,
    steamId: string | null,
  ): Promise<ExtensionRolloutDecision> {
    switch (stage) {
      case 'internal':
        return this.evaluateInternal(sellerId, steamId, stage);
      case 'allowlist':
        return this.evaluateAllowlist(steamId, stage);
      case 'percent':
        return this.evaluatePercent(sellerId, steamId, stage);
      default:
        return { eligible: false, reason: 'stage_off', stage };
    }
  }

  private evaluateInternal(
    sellerId: string,
    steamId: string | null,
    stage: ExtensionRolloutStage,
  ): ExtensionRolloutDecision {
    const userMatch = getExtensionRolloutInternalUserIds().has(sellerId);
    const steamMatch =
      steamId !== null && getExtensionRolloutInternalSteamIds().has(steamId);
    if (userMatch || steamMatch) {
      return { eligible: true, reason: 'internal_match', stage };
    }
    return { eligible: false, reason: 'not_internal', stage };
  }

  private async evaluateAllowlist(
    steamId: string | null,
    stage: ExtensionRolloutStage,
  ): Promise<ExtensionRolloutDecision> {
    if (!steamId) {
      return { eligible: false, reason: 'missing_seller_steam_id', stage };
    }
    if (getExtensionRolloutEnvAllowlistSteamIds().has(steamId)) {
      return { eligible: true, reason: 'allowlist_match', stage };
    }
    const dbEntry = await this.prisma.extensionRolloutAllowlistEntry.findUnique(
      {
        where: { steamId },
        select: { enabled: true },
      },
    );
    if (dbEntry?.enabled) {
      return { eligible: true, reason: 'allowlist_match', stage };
    }
    return { eligible: false, reason: 'not_allowlisted', stage };
  }

  private async evaluatePercent(
    sellerId: string,
    steamId: string | null,
    stage: ExtensionRolloutStage,
  ): Promise<ExtensionRolloutDecision> {
    const allowlistDecision = await this.evaluateAllowlist(steamId, stage);
    if (allowlistDecision.eligible) {
      return allowlistDecision;
    }
    const percent = getExtensionRolloutPercent();
    if (percent <= 0) {
      return { eligible: false, reason: 'percent_excluded', stage };
    }
    if (this.isSellerInPercentBucket(sellerId, percent)) {
      return { eligible: true, reason: 'percent_match', stage };
    }
    return { eligible: false, reason: 'percent_excluded', stage };
  }

  private isSellerInPercentBucket(sellerId: string, percent: number): boolean {
    const digest = createHash('sha256').update(sellerId).digest();
    const bucket = digest.readUInt32BE(0) % 100;
    return bucket < percent;
  }

  private async lookupSellerSteamId(sellerId: string): Promise<string | null> {
    const seller = await this.prisma.user.findUnique({
      where: { id: sellerId },
      select: { steamId: true },
    });
    return seller?.steamId ?? null;
  }

  private logDecision(
    event: string,
    sellerId: string,
    decision: ExtensionRolloutDecision,
    extra: Record<string, unknown>,
  ): void {
    const { requestId } = getAuditContext();
    this.logger.log(
      JSON.stringify({
        event,
        trace: 'extension-rollout',
        correlationId: requestId,
        requestId,
        sellerId,
        eligible: decision.eligible,
        reason: decision.reason,
        stage: decision.stage,
        ...extra,
      }),
    );
  }
}
