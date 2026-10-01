import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TradeStatusPollerService } from '../trades/trade-status-poller.service';
import {
  SteamTradeProvider,
  SteamTradeRateLimitError,
} from '../providers/trade/steam-trade.provider';
import { withSteamRequestCredential } from '../providers/trade/steam-request-credential';
import { SettlementService } from '../settlement/settlement.service';
import { DeliveryWorkflowService } from '../trades/delivery-workflow.service';
@Injectable()
export class SteamOrderVerificationService {
  private readonly nextAllowed = new Map<string, number>();
  constructor(
    private readonly prisma: PrismaService,
    private readonly poller: TradeStatusPollerService,
    @Optional() private readonly settlement?: SettlementService,
  ) {}
  async prepare(orderId: string) {
    return new DeliveryWorkflowService(this.prisma).prepare(orderId);
  }
  async preparationFailure(userId: string, orderId: string) {
    const order = await this.authorize(userId, orderId);
    const operation = order.tradeOperation!;
    if (!order.buyer.steamId) return 'BUYER_STEAM_ID_MISSING';
    if (operation.verificationStage === 'MANUAL_REVIEW') return 'MANUAL_REVIEW';
    const safeReasons = [
      'BASELINE_EXPIRED',
      'BASELINE_ORIGINAL_MISSING',
      'BASELINE_UNAVAILABLE',
      'MAPPING_WINDOW_BUSY',
    ];
    if (
      operation.failReasonCode &&
      safeReasons.includes(operation.failReasonCode)
    )
      return operation.failReasonCode;
    if (operation.nextPreparationAt && operation.nextPreparationAt > new Date())
      return 'BASELINE_RETRY_SCHEDULED';
    return 'BEFORE_BASELINE_NOT_READY';
  }
  async authorize(userId: string, orderId: unknown) {
    if (typeof orderId !== 'string' || !/^[a-f0-9-]{36}$/i.test(orderId))
      throw new BadRequestException('Invalid order');
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        seller: { select: { steamId: true, status: true } },
        buyer: { select: { steamId: true } },
        tradeOperation: true,
        lot: { include: { inventoryAsset: true } },
      },
    });
    if (
      !order ||
      order.sellerId !== userId ||
      order.seller.status !== 'ACTIVE' ||
      !order.seller.steamId ||
      !['WAITING_TRADE', 'DISPUTE', 'SETTLEMENT_HOLD'].includes(order.status) ||
      !order.tradeOperation
    )
      throw new ForbiddenException('Order verification unavailable');
    return order;
  }
  async run(userId: string, payload: Record<string, unknown>) {
    let token = payload.accessToken;
    delete payload.accessToken;
    try {
      if (
        payload.consent !== true ||
        typeof token !== 'string' ||
        !/^[A-Za-z0-9._-]{32,8192}$/.test(token)
      )
        throw new BadRequestException(
          'Explicit consent and temporary credential required',
        );
      const order = await this.authorize(userId, payload.orderId);
      const offerId = order.tradeOperation!.externalOfferId!;
      if (!offerId)
        return { reasonCode: 'WAITING_FOR_OFFER', transitioned: false };
      if (payload.offerId !== offerId)
        throw new BadRequestException('Order offer changed');
      const now = Date.now();
      for (const [key, expiry] of this.nextAllowed)
        if (expiry <= now) this.nextAllowed.delete(key);
      if ((this.nextAllowed.get(userId) ?? 0) > now)
        throw new HttpException('Verification cooldown', 429);
      this.nextAllowed.set(userId, now + 60000);
      const context = {
        ...(order.tradeOperation!.tradeBinding
          ? { tradeBinding: order.tradeOperation!.tradeBinding }
          : {}),
        sellerSteamId: order.seller.steamId,
        buyerSteamId: order.buyer.steamId,
        assetId:
          order.tradeOperation!.expectedAssetId ??
          order.lot.inventoryAsset.assetExternalId,
      };
      return await withSteamRequestCredential(
        offerId,
        context,
        token,
        async () => {
          const proof = await new SteamTradeProvider().verifyTradeOffer(
            offerId,
            context,
          );
          if (
            order.status !== 'DISPUTE' &&
            (proof.identityConflict || proof.reversalDetected)
          ) {
            await this.prisma.tradeOperation.updateMany({
              where: {
                orderId: order.id,
                order: { status: { in: ['WAITING_TRADE', 'SETTLEMENT_HOLD'] } },
              },
              data: {
                verificationStage: 'MANUAL_REVIEW',
                failReasonCode: proof.reasonCode ?? 'STEAM_EVIDENCE_CONFLICT',
                nextVerificationAt: null,
              },
            });
            return {
              offerStatus: proof.status,
              reasonCode: proof.reasonCode,
              transitioned: false,
              mappingVerified: false,
              diagnosticOnly: false,
            };
          }
          // DISPUTE is read-only. Unknown evidence does not force extra failed checks.
          const transitioned =
            order.status === 'WAITING_TRADE' && proof.status === 'accepted'
              ? await this.poller.pollOrderById(order.id, { force: true })
              : order.status === 'SETTLEMENT_HOLD' &&
                  proof.receiptVerified &&
                  this.settlement
                ? (await this.settlement.releaseDueSettlementHold(order.id))
                    .settled
                : false;
          return {
            offerStatus: proof.status,
            reasonCode: transitioned
              ? order.status === 'SETTLEMENT_HOLD'
                ? 'SETTLED'
                : 'DELIVERY_VERIFIED'
              : (proof.reasonCode ?? null),
            mappingVerified: !!proof.receivedAssetId || transitioned,
            transitioned,
            diagnosticOnly: order.status === 'DISPUTE',
          };
        },
      );
    } catch (error) {
      if (error instanceof SteamTradeRateLimitError)
        throw new HttpException('Steam rate limited', 429);
      if (
        error instanceof BadRequestException ||
        error instanceof ForbiddenException ||
        error instanceof HttpException
      )
        throw error;
      throw new HttpException('Steam verification unavailable', 503);
    } finally {
      token = undefined;
    }
  }
}
