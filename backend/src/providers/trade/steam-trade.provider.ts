import { steamTokenOwner } from './steam-token-owner';
import { requestCredential } from './steam-request-credential';
import { steamTokenRead } from './steam-token-read';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { steamFetch } from '../../common/steam/steam-http.client';
import {
  TradeCompletionResult,
  TradeCompletionType,
  TradeProvider,
  TradeVerificationResult,
  TradeVerificationContext,
} from './trade-provider.interface';
import {
  steamOfferMatchesOrder,
  steamReceiptComplete,
  steamReceiptReversed,
  receivedAssetFromSteamReceipt,
} from './steam-delivery-proof';

export class SteamTradeRateLimitError extends Error {
  constructor() {
    super('Steam API rate limited');
    this.name = 'SteamTradeRateLimitError';
  }
}

type SteamTradeOfferResponse = {
  response?: {
    offer?: {
      tradeofferid?: string;
      trade_offer_state?: number;
      tradeid?: string;
      message?: string;
    };
  };
};

const STATE_MAP: Record<number, TradeVerificationResult['status']> = {
  // Active вЂ” Guard already confirmed (or never required).
  2: 'pending',
  // CreatedNeedsConfirmation вЂ” seller must confirm in Steam Mobile.
  9: 'needs_confirmation',
  // In Escrow is not a completed delivery; Steam still holds the exchange.
  11: 'pending',
  3: 'accepted',
  7: 'declined',
  5: 'expired',
  6: 'expired',
  10: 'expired',
};

@Injectable()
export class SteamTradeProvider implements TradeProvider {
  readonly type = 'steam' as const;
  private readonly logger = new Logger(SteamTradeProvider.name);

  completeTrade(
    _orderId: string,
    _type: TradeCompletionType,
  ): Promise<TradeCompletionResult> {
    throw new AppException(
      ErrorCode.BAD_REQUEST,
      'Automated trade completion is not available in module 4.3',
      HttpStatus.BAD_REQUEST,
    );
  }

  async verifyTradeOffer(
    tradeOfferId: string,
    context?: TradeVerificationContext,
  ): Promise<TradeVerificationResult> {
    if (!/^[1-9][0-9]*$/.test(tradeOfferId)) {
      return { status: 'unknown', tradable: null, tradeLockUntil: null };
    }
    const token = requestCredential(tradeOfferId, context);
    if (token && context)
      return this.verifyWithToken(tradeOfferId, context, token);
    const apiKey = process.env.STEAM_WEB_API_KEY;
    if (!apiKey) {
      this.logger.warn(
        'STEAM_WEB_API_KEY is not configured; trade offer status unavailable',
      );
      return {
        status: 'unknown',
        reasonCode: 'STEAM_API_KEY_MISSING',
        tradable: null,
        tradeLockUntil: null,
      };
    }

    const url = new URL(
      'https://api.steampowered.com/IEconService/GetTradeOffer/v1/',
    );
    url.searchParams.set('key', apiKey);
    url.searchParams.set('tradeofferid', tradeOfferId);
    url.searchParams.set('language', 'english');

    const response = await steamFetch(url.toString(), { redirect: 'error' });
    if (response.status === 429) {
      throw new SteamTradeRateLimitError();
    }
    if (!response.ok) {
      throw new Error(`Steam GetTradeOffer returned ${response.status}`);
    }

    const data = (await response.json()) as SteamTradeOfferResponse | null;
    const offer = data?.response?.offer;
    if (!offer || offer.tradeofferid !== tradeOfferId) {
      // HTTP 200 does not imply the key can see this participant's offer.
      // Do not log the authenticated URL or turn missing evidence into success.
      this.logger.warn('Steam offer unavailable or response ID mismatch');
      return {
        status: 'unknown',
        identityConflict: !!offer && offer.tradeofferid !== undefined,
        reasonCode: 'STEAM_OFFER_UNAVAILABLE',
        tradable: null,
        tradeLockUntil: null,
      };
    }
    const state = offer.trade_offer_state;
    if (
      context &&
      !steamOfferMatchesOrder(
        offer,
        context,
        process.env.STEAM_WEB_API_KEY_OWNER_STEAM_ID,
      )
    ) {
      return {
        status: 'unknown',
        identityConflict:
          process.env.STEAM_WEB_API_KEY_OWNER_STEAM_ID ===
          context.sellerSteamId,
        reasonCode:
          process.env.STEAM_WEB_API_KEY_OWNER_STEAM_ID !== context.sellerSteamId
            ? 'STEAM_KEY_OWNER_UNVERIFIED'
            : 'STEAM_OFFER_ORDER_MISMATCH',
        tradable: null,
        tradeLockUntil: null,
      };
    }
    const status =
      state !== undefined ? (STATE_MAP[state] ?? 'unknown') : 'unknown';

    // An accepted status alone is not evidence for a marketplace order.
    if (status === 'accepted' && !context) {
      return { status: 'unknown', tradable: null, tradeLockUntil: null };
    }

    if (context && status === 'accepted') {
      if (!offer.tradeid || !/^[1-9][0-9]{0,19}$/.test(offer.tradeid))
        return { status: 'unknown', tradable: null, tradeLockUntil: null };
      const result = await this.readReceipt(offer.tradeid, context, { apiKey });
      return {
        ...result,
        offerAccepted: true,
        bindingVerified:
          !!context.tradeBinding && offer.message === context.tradeBinding,
      };
    }
    return { status, tradable: null, tradeLockUntil: null };
  }

  /** Only invoked with anchors from a validated immutable proof; no old offer read. */
  async verifyTradeReceipt(
    tradeId: string,
    offerId: string,
    context: TradeVerificationContext,
  ): Promise<TradeVerificationResult> {
    const unavailable: TradeVerificationResult = {
      status: 'unknown',
      tradable: null,
      tradeLockUntil: null,
      reasonCode: 'STEAM_RECEIPT_UNAVAILABLE',
    };
    if (
      !/^[1-9][0-9]{0,19}$/.test(tradeId) ||
      !context.sellerSteamId ||
      !context.buyerSteamId
    )
      return unavailable;
    const token = requestCredential(offerId, context);
    if (token) {
      // Without a fresh outgoing offer, a token must explicitly identify its owner.
      const identity = await steamTokenRead('GetTokenDetails', token, {});
      if (
        identity.status !== 200 ||
        steamTokenOwner(identity.data) !== context.sellerSteamId
      )
        return unavailable;
      return this.readReceipt(tradeId, context, { token });
    }
    const apiKey = process.env.STEAM_WEB_API_KEY;
    if (
      !apiKey ||
      process.env.STEAM_WEB_API_KEY_OWNER_STEAM_ID !== context.sellerSteamId
    )
      return unavailable;
    return this.readReceipt(tradeId, context, { apiKey });
  }

  private async readReceipt(
    tradeId: string,
    context: TradeVerificationContext,
    credential: { token?: string; apiKey?: string },
  ): Promise<TradeVerificationResult> {
    const unknown = (reasonCode: string): TradeVerificationResult => ({
      status: 'unknown',
      reasonCode,
      tradable: null,
      tradeLockUntil: null,
    });
    let status: number;
    let data: unknown;
    if (credential.token) {
      const reply = await steamTokenRead('GetTradeStatus', credential.token, {
        tradeid: tradeId,
      });
      status = reply.status;
      data = reply.data;
    } else {
      const url = new URL(
        'https://api.steampowered.com/IEconService/GetTradeStatus/v1/',
      );
      url.searchParams.set('key', credential.apiKey!);
      url.searchParams.set('tradeid', tradeId);
      const reply = await steamFetch(url, { redirect: 'error' });
      status = reply.status;
      data = reply.ok ? await reply.json() : null;
    }
    if (status === 429) throw new SteamTradeRateLimitError();
    const trades = (data as { response?: { trades?: unknown[] } } | null)
      ?.response?.trades;
    if (status !== 200 || !Array.isArray(trades) || trades.length !== 1)
      return unknown('STEAM_RECEIPT_UNAVAILABLE');
    if (steamReceiptReversed(trades[0], tradeId, context))
      return { ...unknown('STEAM_TRADE_REVERSAL'), reversalDetected: true };
    if (!steamReceiptComplete(trades[0], tradeId, context))
      return { ...unknown('STEAM_RECEIPT_CONFLICT'), identityConflict: true };
    const assetId = receivedAssetFromSteamReceipt(trades[0], tradeId, context);
    const item = (trades[0] as { assets_given: { new_contextid?: string }[] })
      .assets_given[0];
    return {
      status: 'accepted',
      receiptVerified: true,
      tradeId,
      ...(assetId
        ? { receivedAssetId: assetId, receivedContextId: item.new_contextid }
        : {}),
      reasonCode: 'STEAM_RECEIPT_VERIFIED',
      tradable: null,
      tradeLockUntil: null,
    };
  }
  private async verifyWithToken(
    offerId: string,
    context: TradeVerificationContext,
    token: string,
  ): Promise<TradeVerificationResult> {
    const unknown = (reasonCode: string): TradeVerificationResult => ({
      status: 'unknown',
      reasonCode,
      tradable: null,
      tradeLockUntil: null,
    });
    const read = async (
      method: 'GetTokenDetails' | 'GetTradeOffer' | 'GetTradeStatus',
      params: Record<string, string> = {},
    ) => {
      const result = await steamTokenRead(method, token, params);
      if (result.status === 429) throw new SteamTradeRateLimitError();
      return result;
    };
    // An explicit identity contradiction fails closed. Missing legacy OAuth
    // identity is not authority; the exact server-read seller perspective below is.
    const identity = await steamTokenRead('GetTokenDetails', token, {});
    const identityData = identity.data as {
      steamid?: unknown;
      response?: { steamid?: unknown };
    } | null;
    const owner = steamTokenOwner(identity.data);
    const explicit =
      identityData?.steamid !== undefined ||
      identityData?.response?.steamid !== undefined;
    if (
      explicit &&
      (identity.status !== 200 || owner !== context.sellerSteamId)
    ) {
      this.logger.warn(
        JSON.stringify({
          event: 'steam_token_identity_unverified',
          httpStatus: identity.status,
          ownerMatches: false,
        }),
      );
      return { ...unknown('STEAM_IDENTITY_CONFLICT'), identityConflict: true };
    }
    const reply = await read('GetTradeOffer', {
      tradeofferid: offerId,
      language: 'english',
    });
    if (reply.status !== 200) return unknown('STEAM_TOKEN_READ_UNAVAILABLE');
    const data = reply.data as SteamTradeOfferResponse | null;
    const offer = data?.response?.offer;
    if (!offer || offer.tradeofferid !== offerId)
      return {
        ...unknown('STEAM_OFFER_UNAVAILABLE'),
        identityConflict: !!offer && offer.tradeofferid !== undefined,
      };
    if (
      !steamOfferMatchesOrder(
        offer,
        context,
        context.sellerSteamId ?? undefined,
      )
    )
      return {
        ...unknown('STEAM_OFFER_ORDER_MISMATCH'),
        identityConflict: true,
      };
    const status = STATE_MAP[offer.trade_offer_state ?? -1] ?? 'unknown';
    if (status !== 'accepted')
      return { status, tradable: null, tradeLockUntil: null };
    if (!offer.tradeid || !/^[1-9][0-9]{0,19}$/.test(offer.tradeid))
      return unknown('STEAM_RECEIPT_MAPPING_UNAVAILABLE');
    const receipt = await this.readReceipt(offer.tradeid, context, { token });
    return {
      ...receipt,
      offerAccepted: true,
      bindingVerified:
        !!context.tradeBinding && offer.message === context.tradeBinding,
    };
  }
}
