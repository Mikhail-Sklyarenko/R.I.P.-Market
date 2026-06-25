import { Injectable, NotImplementedException } from '@nestjs/common';
import {
  TradeCompletionResult,
  TradeCompletionType,
  TradeProvider,
  TradeVerificationResult,
} from './trade-provider.interface';

@Injectable()
export class SteamTradeProvider implements TradeProvider {
  readonly type = 'steam' as const;

  completeTrade(
    _orderId: string,
    _type: TradeCompletionType,
  ): Promise<TradeCompletionResult> {
    return Promise.reject(
      new NotImplementedException(
        'Steam trade completion requires a trade bot or extension bridge. See docs/steam-spike.md.',
      ),
    );
  }

  verifyTradeOffer(_tradeOfferId: string): Promise<TradeVerificationResult> {
    return Promise.reject(
      new NotImplementedException(
        'Automated Steam trade verification without extension is partial at best. See docs/steam-spike.md.',
      ),
    );
  }
}
