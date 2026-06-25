import { Injectable } from '@nestjs/common';
import {
  TradeCompletionResult,
  TradeCompletionType,
  TradeProvider,
} from './trade-provider.interface';

@Injectable()
export class MockTradeProvider implements TradeProvider {
  readonly type = 'mock' as const;

  completeTrade(
    orderId: string,
    type: TradeCompletionType,
    options?: { reasonCode?: string },
  ): Promise<TradeCompletionResult> {
    switch (type) {
      case 'SUCCESS':
        return Promise.resolve({ providerRef: `mock-success-${orderId}` });
      case 'FAIL_SAFE':
        return Promise.resolve({
          providerRef: `mock-fail-safe-${orderId}`,
          failReasonCode: options?.reasonCode ?? 'SAFE_FAIL',
        });
      case 'FAIL_DISPUTE':
        return Promise.resolve({
          providerRef: `mock-fail-dispute-${orderId}`,
          failReasonCode: options?.reasonCode ?? 'DISPUTE_FAIL',
        });
      case 'TIMEOUT':
        return Promise.resolve({
          providerRef: `mock-timeout-${orderId}`,
          failReasonCode: 'TRADE_TIMEOUT',
        });
      default:
        return Promise.resolve({ providerRef: `mock-unknown-${orderId}` });
    }
  }
}
