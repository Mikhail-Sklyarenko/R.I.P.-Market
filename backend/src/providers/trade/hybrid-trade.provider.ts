import { Injectable } from '@nestjs/common';
import { MockTradeProvider } from './mock-trade.provider';
import { SteamTradeProvider } from './steam-trade.provider';
import {
  TradeCompletionResult,
  TradeCompletionType,
  TradeProvider,
  TradeVerificationResult,
} from './trade-provider.interface';

/**
 * Staging/admin-friendly trade provider:
 * - completeTrade stays mock (admin SUCCESS/FAIL buttons)
 * - verifyTradeOffer uses live Steam so real P2P offer IDs are not stuck as
 *   forever-pending while inventory delta drives confirmation
 */
@Injectable()
export class HybridTradeProvider implements TradeProvider {
  readonly type = 'mock' as const;

  constructor(
    private readonly mock: MockTradeProvider,
    private readonly steam: SteamTradeProvider,
  ) {}

  completeTrade(
    orderId: string,
    type: TradeCompletionType,
    options?: { reasonCode?: string },
  ): Promise<TradeCompletionResult> {
    return this.mock.completeTrade(orderId, type, options);
  }

  verifyTradeOffer(tradeOfferId: string): Promise<TradeVerificationResult> {
    return this.steam.verifyTradeOffer(tradeOfferId);
  }
}
