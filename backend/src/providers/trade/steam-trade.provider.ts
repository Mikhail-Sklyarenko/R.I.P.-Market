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

    let receivedAssetId: string | undefined;
    if (context && status === 'accepted') {
      if (!offer.tradeid || !/^[1-9][0-9]{0,19}$/.test(offer.tradeid)) {
        return { status: 'unknown', tradable: null, tradeLockUntil: null };
      }
      const receiptUrl = new URL(
        'https://api.steampowered.com/IEconService/GetTradeStatus/v1/',
      );
      receiptUrl.searchParams.set('key', apiKey);
      receiptUrl.searchParams.set('tradeid', offer.tradeid);
      const receiptResponse = await steamFetch(receiptUrl, {
        redirect: 'error',
      });
      if (receiptResponse.status === 429) throw new SteamTradeRateLimitError();
      if (!receiptResponse.ok)
        return { status: 'unknown', tradable: null, tradeLockUntil: null };
      const receiptData = (await receiptResponse.json()) as {
        response?: { trades?: unknown[] };
      } | null;
      const trades = receiptData?.response?.trades;
      if (Array.isArray(trades) && trades.length === 1) {
        receivedAssetId =
          receivedAssetFromSteamReceipt(trades[0], offer.tradeid, context) ??
          undefined;
      }
      if (!receivedAssetId)
        return {
          status: 'unknown',
          reasonCode: 'STEAM_RECEIPT_MAPPING_UNAVAILABLE',
          tradable: null,
          tradeLockUntil: null,
        };
    }
    return {
      ...(receivedAssetId ? { receivedAssetId } : {}),
      status,
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
    // Do not trust a client-supplied SteamID or an unsigned JWT claim.
    const identity = await read('GetTokenDetails');
    const identityData = identity.data as {
      response?: { steamid?: unknown };
    } | null;
    if (
      identity.status !== 200 ||
      identityData?.response?.steamid !== context.sellerSteamId
    ) {
      // Fixed scalars only: never log URL, token, upstream strings or identity.
      this.logger.warn(
        JSON.stringify({
          event: 'steam_token_identity_unverified',
          httpStatus: identity.status,
          responsePresent: identityData?.response !== undefined,
          steamIdPresent: identityData?.response?.steamid !== undefined,
          steamIdIsString: typeof identityData?.response?.steamid === 'string',
          ownerMatches:
            identityData?.response?.steamid === context.sellerSteamId,
        }),
      );
      return unknown('STEAM_TOKEN_OWNER_UNVERIFIED');
    }
    const reply = await read('GetTradeOffer', {
      tradeofferid: offerId,
      language: 'english',
    });
    if (reply.status !== 200) return unknown('STEAM_TOKEN_READ_UNAVAILABLE');
    const data = reply.data as SteamTradeOfferResponse | null;
    const offer = data?.response?.offer;
    if (!offer || offer.tradeofferid !== offerId)
      return unknown('STEAM_OFFER_UNAVAILABLE');
    if (
      !steamOfferMatchesOrder(
        offer,
        context,
        context.sellerSteamId ?? undefined,
      )
    )
      return unknown('STEAM_OFFER_ORDER_MISMATCH');
    const status = STATE_MAP[offer.trade_offer_state ?? -1] ?? 'unknown';
    if (status !== 'accepted')
      return { status, tradable: null, tradeLockUntil: null };
    if (!offer.tradeid || !/^[1-9][0-9]{0,19}$/.test(offer.tradeid))
      return unknown('STEAM_RECEIPT_MAPPING_UNAVAILABLE');
    const receipt = await read('GetTradeStatus', { tradeid: offer.tradeid });
    const trades = (
      receipt.data as { response?: { trades?: unknown[] } } | null
    )?.response?.trades;
    const receivedAssetId =
      receipt.status === 200 && Array.isArray(trades) && trades.length === 1
        ? receivedAssetFromSteamReceipt(trades[0], offer.tradeid, context)
        : null;
    if (!receivedAssetId) return unknown('STEAM_RECEIPT_MAPPING_UNAVAILABLE');
    return {
      status: 'accepted',
      receivedAssetId,
      tradable: null,
      tradeLockUntil: null,
    };
  }
}
