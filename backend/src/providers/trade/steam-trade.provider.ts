import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { steamFetch } from '../../common/steam/steam-http.client';
import {
  TradeCompletionResult,
  TradeCompletionType,
  TradeProvider,
  TradeVerificationResult,
} from './trade-provider.interface';

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
    };
  };
};

const STATE_MAP: Record<number, TradeVerificationResult['status']> = {
  // Active — Guard already confirmed (or never required).
  2: 'pending',
  // CreatedNeedsConfirmation — seller must confirm in Steam Mobile.
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
  ): Promise<TradeVerificationResult> {
    if (!/^[1-9][0-9]*$/.test(tradeOfferId)) {
      return { status: 'unknown', tradable: null, tradeLockUntil: null };
    }
    const apiKey = process.env.STEAM_WEB_API_KEY;
    if (!apiKey) {
      this.logger.warn(
        'STEAM_WEB_API_KEY is not configured; trade offer status unavailable',
      );
      return {
        status: 'unknown',
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

    const response = await steamFetch(url.toString());
    if (response.status === 429) {
      throw new SteamTradeRateLimitError();
    }
    if (!response.ok) {
      throw new Error(`Steam GetTradeOffer returned ${response.status}`);
    }

    const data = (await response.json()) as SteamTradeOfferResponse;
    const offer = data.response?.offer;
    if (!offer || offer.tradeofferid !== tradeOfferId) {
      // HTTP 200 does not imply the key can see this participant's offer.
      // Do not log the authenticated URL or turn missing evidence into success.
      this.logger.warn('Steam offer unavailable or response ID mismatch');
      return { status: 'unknown', tradable: null, tradeLockUntil: null };
    }
    const state = offer.trade_offer_state;
    const status =
      state !== undefined ? (STATE_MAP[state] ?? 'unknown') : 'unknown';

    return {
      status,
      tradable: null,
      tradeLockUntil: null,
    };
  }
}
