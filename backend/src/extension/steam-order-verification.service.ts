import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TradeStatusPollerService } from '../trades/trade-status-poller.service';
import {
  SteamTradeProvider,
  SteamTradeRateLimitError,
} from '../providers/trade/steam-trade.provider';
import { withSteamRequestCredential } from '../providers/trade/steam-request-credential';
@Injectable()
export class SteamOrderVerificationService {
  private readonly nextAllowed = new Map<string, number>();
  constructor(
    private readonly prisma: PrismaService,
    private readonly poller: TradeStatusPollerService,
  ) {}
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
      !['WAITING_TRADE', 'DISPUTE'].includes(order.status) ||
      !order.tradeOperation?.externalOfferId
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
      if (payload.offerId !== offerId)
        throw new BadRequestException('Order offer changed');
      const now = Date.now();
      for (const [key, expiry] of this.nextAllowed)
        if (expiry <= now) this.nextAllowed.delete(key);
      if ((this.nextAllowed.get(userId) ?? 0) > now)
        throw new HttpException('Verification cooldown', 429);
      this.nextAllowed.set(userId, now + 60000);
      const context = {
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
          // DISPUTE is read-only. Unknown evidence does not force extra failed checks.
          const transitioned =
            order.status === 'WAITING_TRADE' && proof.status === 'accepted'
              ? await this.poller.pollOrderById(order.id)
              : false;
          return {
            offerStatus: proof.status,
            reasonCode: proof.reasonCode ?? null,
            mappingVerified: !!proof.receivedAssetId,
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
