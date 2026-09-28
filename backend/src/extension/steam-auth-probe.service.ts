import {
  ForbiddenException,
  Injectable,
  BadRequestException,
  HttpException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  steamOfferMatchesOrder,
  receivedAssetFromSteamReceipt,
} from '../providers/trade/steam-delivery-proof';

export const PROBE_SELLER = '76561198195181115';
const OFFER = '9391832342';
const TRADE = '744938690018752002';
const context = {
  sellerSteamId: PROBE_SELLER,
  buyerSteamId: '76561198655632881',
  assetId: '50586823960',
};
const record = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};

/** Temporary diagnostic only. No order, wallet, inventory or credential writes. */
@Injectable()
export class SteamAuthProbeService {
  private nextAllowedAt = 0;
  constructor(private readonly prisma: PrismaService) {}

  async authorize(userId: string): Promise<void> {
    const until = Date.parse(process.env.STEAM_AUTH_PROBE_UNTIL ?? '');
    const now = Date.now();
    // Operator enables a short window; absent, expired or excessive windows fail closed.
    if (!Number.isFinite(until) || until <= now || until > now + 3600000) {
      throw new ForbiddenException('Steam diagnostic window is closed');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { steamId: true, role: true, status: true },
    });
    if (
      user?.steamId !== PROBE_SELLER ||
      user.role !== 'ADMIN' ||
      user.status !== 'ACTIVE'
    ) {
      throw new ForbiddenException(
        'Steam diagnostic account is not authorized',
      );
    }
  }

  async run(userId: string, payload: Record<string, unknown>) {
    await this.authorize(userId);
    let token = payload.accessToken;
    // Drop the request-body reference before any asynchronous Steam work.
    delete payload.accessToken;
    if (
      payload.consent !== true ||
      typeof token !== 'string' ||
      token.length < 32 ||
      token.length > 8192 ||
      !/^[A-Za-z0-9._-]+$/.test(token)
    ) {
      throw new BadRequestException(
        'Steam diagnostic consent or token is invalid',
      );
    }
    if (Date.now() < this.nextAllowedAt)
      throw new HttpException('Steam diagnostic cooldown', 429);
    this.nextAllowedAt = Date.now() + 60000;
    try {
      const offerReply = await this.query(
        'GetTradeOffer',
        { tradeofferid: OFFER, language: 'english' },
        token,
      );
      const offer = record(record(offerReply.data).response).offer;
      const exactOffer = record(offer).tradeofferid === OFFER;
      const receiptReply = await this.query(
        'GetTradeStatus',
        { tradeid: TRADE, get_descriptions: 'false' },
        token,
      );
      const trades = record(record(receiptReply.data).response).trades;
      const receipt =
        Array.isArray(trades) &&
        trades.length === 1 &&
        record(trades[0]).tradeid === TRADE
          ? record(trades[0])
          : null;
      const given = receipt?.assets_given;
      const item =
        Array.isArray(given) && given.length === 1 ? record(given[0]) : {};
      // Only fixed booleans/numbers leave the probe. Never echo Steam strings or errors.
      return {
        diagnosticOnly: true,
        offerHttpStatus: offerReply.status,
        exactOffer,
        offerMatchesOrder:
          exactOffer && steamOfferMatchesOrder(offer, context, PROBE_SELLER),
        offerAccepted: exactOffer && record(offer).trade_offer_state === 3,
        receiptHttpStatus: receiptReply.status,
        exactReceipt: receipt !== null,
        receiptPartnerMatches: receipt?.steamid_other === context.buyerSteamId,
        receiptComplete: receipt?.status === 3,
        protectedContext: item.new_contextid === '16',
        receiptMappingVerified:
          receivedAssetFromSteamReceipt(receipt, TRADE, context) !== null,
        settlementAuthorized: false,
      };
    } finally {
      token = undefined;
    }
  }

  private async query(
    method: 'GetTradeOffer' | 'GetTradeStatus',
    params: Record<string, string>,
    token: string,
  ): Promise<{ status: number; data: unknown }> {
    const url = new URL(
      `https://api.steampowered.com/IEconService/${method}/v1/`,
    );
    url.searchParams.set('access_token', token);
    for (const [key, value] of Object.entries(params))
      url.searchParams.set(key, value);
    try {
      // Direct HTTPS only: no configured third-party Steam proxy or redirects.
      const response = await fetch(url, {
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        await response.body?.cancel();
        return { status: response.status, data: null };
      }
      const reader = response.body?.getReader();
      if (!reader) return { status: response.status, data: null };
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > 262144) {
            await reader.cancel();
            return { status: response.status, data: null };
          }
          chunks.push(part.value);
        }
        return {
          status: response.status,
          data: JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown,
        };
      } finally {
        reader.releaseLock();
      }
    } catch {
      return { status: 0, data: null };
    } finally {
      url.search = '';
    }
  }
}
