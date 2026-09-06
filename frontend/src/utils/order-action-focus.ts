import type { DealHealth } from './deal-health.ts';
import type { TradeTimeoutUrgency } from './trade-timeout-escalation.ts';

/**
 * Order page focus: one state + one primary CTA above the fold.
 * Secondary chrome (ID, money, calm health, support) collapses so the user
 * is not forced to read three “what to do” cards at once.
 */

export type OrderActionTimeoutMode = 'hidden' | 'compact' | 'expanded';

export type OrderActionFocus = {
  /** DealHealthBanner above the fold — only when it adds urgency, not a duplicate. */
  showDealHealthInline: boolean;
  timeoutMode: OrderActionTimeoutMode;
  /** Deal ID / money / support / cancel / calm extension chrome under “More”. */
  collapseSecondary: boolean;
  /** Extension pair/connect stays above the fold when the user must act on it. */
  extensionPairAboveFold: boolean;
};

export function resolveOrderActionFocus(params: {
  orderStatus: string;
  isMismatch: boolean;
  dealHealth: DealHealth | null;
  timeoutUrgency: TradeTimeoutUrgency | null;
  extensionConnected: boolean;
  needsExtensionPair: boolean;
}): OrderActionFocus {
  const activeTrade =
    params.orderStatus === 'WAITING_TRADE' ||
    params.orderStatus === 'TRADE_CONFIRMED' ||
    params.orderStatus === 'SETTLEMENT_HOLD';

  if (!activeTrade) {
    return {
      showDealHealthInline: false,
      timeoutMode: 'hidden',
      collapseSecondary: params.orderStatus === 'DISPUTE',
      extensionPairAboveFold: false,
    };
  }

  const health = params.dealHealth;
  const showDealHealthInline =
    Boolean(health) &&
    !params.isMismatch &&
    (health!.tone === 'warn' || health!.tone === 'error');

  let timeoutMode: OrderActionTimeoutMode = 'hidden';
  if (params.orderStatus === 'WAITING_TRADE' && params.timeoutUrgency) {
    if (
      params.timeoutUrgency === 'critical' ||
      params.timeoutUrgency === 'expired'
    ) {
      timeoutMode = 'expanded';
    } else if (params.timeoutUrgency === 'soon') {
      timeoutMode = 'expanded';
    } else {
      timeoutMode = 'compact';
    }
  }

  return {
    showDealHealthInline,
    timeoutMode,
    collapseSecondary: true,
    extensionPairAboveFold:
      params.needsExtensionPair && !params.extensionConnected,
  };
}
