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
      trade_offer_state?: number;
    };
  };
};

const STATE_MAP: Record<number, TradeVerificationResult['status']> = {
  2: 'pending',
  9: 'pending',
  // 11 = In Escrow: buyer accepted; item may already be in buyer inventory.
  11: 'accepted',
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
    const state = data.response?.offer?.trade_offer_state;
    const status =
      state !== undefined ? (STATE_MAP[state] ?? 'unknown') : 'unknown';

    return {
      status,
      tradable: null,
      tradeLockUntil: null,
    };
  }
}
