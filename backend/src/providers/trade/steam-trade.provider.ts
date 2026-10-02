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
    let receivedContextId: string | undefined;
    let receiptVerified = false;
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
        if (steamReceiptReversed(trades[0], offer.tradeid, context))
          return {
            status: 'unknown',
            reversalDetected: true,
            reasonCode: 'STEAM_TRADE_REVERSAL',
            tradable: null,
            tradeLockUntil: null,
          };
        receiptVerified = steamReceiptComplete(
          trades[0],
          offer.tradeid,
          context,
        );
        receivedAssetId =
          receivedAssetFromSteamReceipt(trades[0], offer.tradeid, context) ??
          undefined;
      }
      if (receivedAssetId)
        receivedContextId = (
          trades![0] as { assets_given: { new_contextid: string }[] }
        ).assets_given[0].new_contextid;
      if (!receiptVerified)
        return {
          status: 'unknown',
          offerAccepted: true,
          reasonCode: 'STEAM_RECEIPT_UNAVAILABLE',
          tradable: null,
          tradeLockUntil: null,
        };
    }
    return {
      ...(context?.tradeBinding
        ? { bindingVerified: offer.message === context.tradeBinding }
        : {}),
      ...(receiptVerified
        ? {
            receiptVerified,
            tradeId: offer.tradeid,
            receivedAssetId,
            receivedContextId,
          }
        : {}),
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
    const exactReceipt =
      receipt.status === 200 && Array.isArray(trades) && trades.length === 1;
    if (
      exactReceipt &&
      steamReceiptReversed(trades[0], offer.tradeid, context)
    ) {
      this.logger.warn(
        JSON.stringify({ event: 'steam_trade_reversal_detected', offerId }),
      );
      return { ...unknown('STEAM_TRADE_REVERSAL'), reversalDetected: true };
    }
    if (
      !exactReceipt ||
      !steamReceiptComplete(trades[0], offer.tradeid, context)
    )
      return { ...unknown('STEAM_RECEIPT_UNAVAILABLE'), offerAccepted: true };
    const receivedAssetId =
      receivedAssetFromSteamReceipt(trades[0], offer.tradeid, context) ??
      undefined;
    const receiptItem = (
      trades[0] as { assets_given: { new_contextid?: string }[] }
    ).assets_given[0];
    this.logger.log(
      JSON.stringify({ event: 'steam_receipt_verified', offerId }),
    );
    if (!receivedAssetId)
      this.logger.log(
        JSON.stringify({ event: 'steam_destination_mapping_missing', offerId }),
      );
    return {
      status: 'accepted',
      ...(context.tradeBinding
        ? { bindingVerified: offer.message === context.tradeBinding }
        : {}),
      receiptVerified: true,
      tradeId: offer.tradeid,
      receivedAssetId,
      receivedContextId: receivedAssetId
        ? receiptItem.new_contextid
        : undefined,
      reasonCode: receivedAssetId
        ? 'STEAM_RECEIPT_VERIFIED'
        : 'STEAM_DESTINATION_MAPPING_PENDING',
      tradable: null,
      tradeLockUntil: null,
    };
  }
}
