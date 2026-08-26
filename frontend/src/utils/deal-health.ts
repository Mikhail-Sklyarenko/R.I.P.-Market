import type { Order } from '../api/types.ts';
import { isSellerManualFallbackNeeded } from './manual-fallback.ts';
import { isOrderTradeDeliveryCheck } from './order-trade.ts';

export type DealHealthTone = 'ok' | 'warn' | 'error' | 'info';

export type DealHealth = {
  tone: DealHealthTone;
  titleKey: string;
  bodyKey: string;
  supportCode?: string | null;
};

/**
 * Client-facing deal health: ok / problem / what to do.
 * Pure derivation from order state (extension session is optional overlay).
 */
export function resolveDealHealth(params: {
  order: Order;
  role: 'buyer' | 'seller' | 'other';
  extensionConnected?: boolean | null;
  extensionMode?: boolean;
}): DealHealth | null {
  const { order, role, extensionConnected, extensionMode } = params;
  if (
    order.status !== 'WAITING_TRADE' &&
    order.status !== 'TRADE_CONFIRMED' &&
    order.status !== 'SETTLEMENT_HOLD'
  ) {
    return null;
  }

  // B4: extension mismatch must surface on the site immediately.
  if (order.tradeVerification?.status === 'mismatch') {
    return {
      tone: 'error',
      titleKey: 'dealHealth.mismatchTitle',
      bodyKey: 'dealHealth.mismatchBody',
      supportCode: 'ITEM_MISMATCH',
    };
  }

  if (order.status === 'SETTLEMENT_HOLD') {
    return {
      tone: 'info',
      titleKey:
        role === 'seller'
          ? 'dealHealth.settlementSellerTitle'
          : 'dealHealth.settlementBuyerTitle',
      bodyKey:
        role === 'seller'
          ? 'dealHealth.settlementSellerBody'
          : 'dealHealth.settlementBuyerBody',
    };
  }

  if (order.status === 'TRADE_CONFIRMED') {
    return {
      tone: 'info',
      titleKey:
        role === 'seller'
          ? 'dealHealth.tradeConfirmedSellerTitle'
          : 'dealHealth.tradeConfirmedBuyerTitle',
      bodyKey:
        role === 'seller'
          ? 'dealHealth.tradeConfirmedSellerBody'
          : 'dealHealth.tradeConfirmedBuyerBody',
    };
  }

  if (role === 'seller') {
    if (isOrderTradeDeliveryCheck(order)) {
      return {
        tone: 'info',
        titleKey: 'dealHealth.deliveryCheckTitle',
        bodyKey: 'dealHealth.deliveryCheckBody',
        supportCode: order.tradeTask?.lastErrorCode ?? 'ITEM_ALREADY_GONE',
      };
    }
    if (order.tradeTask?.confirmPending) {
      return {
        tone: 'warn',
        titleKey: 'dealHealth.guardTitle',
        bodyKey: 'dealHealth.guardBody',
        supportCode: 'CONFIRM_PENDING',
      };
    }
    if (isSellerManualFallbackNeeded(order)) {
      return {
        tone: 'warn',
        titleKey: 'dealHealth.manualTitle',
        bodyKey: 'dealHealth.manualBody',
        supportCode: order.tradeTask?.lastErrorCode ?? 'MANUAL_FALLBACK',
      };
    }
    if (extensionMode && extensionConnected === false) {
      return {
        tone: 'warn',
        titleKey: 'dealHealth.extensionOfflineTitle',
        bodyKey: 'dealHealth.extensionOfflineBody',
        supportCode: 'EXT_DISCONNECTED',
      };
    }
    if (
      order.tradeTask?.lastErrorCode &&
      order.tradeTask.status !== 'FAILED' &&
      !order.tradeOperation?.externalOfferId
    ) {
      return {
        tone: 'warn',
        titleKey: 'dealHealth.retryTitle',
        bodyKey: 'dealHealth.retryBody',
        supportCode: order.tradeTask.lastErrorCode,
      };
    }
    if (!order.tradeOperation?.externalOfferId) {
      return {
        tone: 'ok',
        titleKey: 'dealHealth.autoSendTitle',
        bodyKey: 'dealHealth.autoSendBody',
      };
    }
    return {
      tone: 'ok',
      titleKey: 'dealHealth.waitingBuyerTitle',
      bodyKey: 'dealHealth.waitingBuyerBody',
    };
  }

  if (role === 'buyer') {
    if (
      order.tradeOperation?.externalOfferId &&
      extensionMode &&
      extensionConnected === false
    ) {
      return {
        tone: 'warn',
        titleKey: 'dealHealth.buyerPairTitle',
        bodyKey: 'dealHealth.buyerPairBody',
        supportCode: 'EXT_BUYER_PAIR',
      };
    }
    if (!order.tradeOperation?.externalOfferId) {
      return {
        tone: 'ok',
        titleKey: 'dealHealth.buyerWaitingOfferTitle',
        bodyKey: 'dealHealth.buyerWaitingOfferBody',
      };
    }
    return {
      tone: 'ok',
      titleKey: 'dealHealth.buyerAcceptTitle',
      bodyKey: 'dealHealth.buyerAcceptBody',
    };
  }

  return null;
}
