import type { DeliveryProbe, Order } from '../api/types.ts';

export type DualSignalTone = 'ok' | 'pending' | 'warn' | 'unknown';

export type DualSignalRow = {
  key: 'offer' | 'inventory';
  tone: DualSignalTone;
  labelKey: string;
};

export type PostAcceptTrustView = {
  phase: 'delivery_verifying' | 'settlement_hold';
  titleKey: string;
  bodyKey: string;
  /** One-line trust reason (seller hold protection / buyer item ownership). */
  reasonKey: string;
  dualSignals: DualSignalRow[] | null;
  holdUntil: string | null;
};

function mapOfferSignal(probe: DeliveryProbe | null | undefined): DualSignalTone {
  if (!probe) {
    return 'pending';
  }
  const offer = (probe.offerStatus ?? '').toLowerCase();
  const outcome = (probe.outcome ?? '').toLowerCase();
  if (
    outcome.includes('confirm') ||
    offer.includes('accepted') ||
    offer === '3' ||
    offer === 'accepted'
  ) {
    return 'ok';
  }
  if (outcome.includes('dispute') || outcome.includes('fail')) {
    return 'warn';
  }
  if (offer.includes('active') || offer === '2' || offer.includes('pending')) {
    return 'pending';
  }
  return 'unknown';
}

function mapInventorySignal(probe: DeliveryProbe | null | undefined): DualSignalTone {
  if (!probe) {
    return 'pending';
  }
  switch (probe.inventoryHint) {
    case 'confirmed':
      return 'ok';
    case 'seller_still_holds':
      return 'warn';
    case 'pending':
      return 'pending';
    case 'unknown':
      return 'unknown';
    default:
      return 'pending';
  }
}

/**
 * B5: calm trust surface after Steam accept — dual-signal delivery, then settlement hold.
 */
export function resolvePostAcceptTrust(params: {
  order: Order;
  role: 'buyer' | 'seller' | 'other';
}): PostAcceptTrustView | null {
  const { order, role } = params;
  if (order.status === 'TRADE_CONFIRMED') {
    const probe = order.deliveryProbe;
    return {
      phase: 'delivery_verifying',
      titleKey:
        role === 'seller'
          ? 'postAcceptTrust.deliverySellerTitle'
          : 'postAcceptTrust.deliveryBuyerTitle',
      bodyKey:
        role === 'seller'
          ? 'postAcceptTrust.deliverySellerBody'
          : 'postAcceptTrust.deliveryBuyerBody',
      reasonKey:
        role === 'seller'
          ? 'postAcceptTrust.deliverySellerReason'
          : 'postAcceptTrust.deliveryBuyerReason',
      dualSignals: [
        {
          key: 'offer',
          tone: mapOfferSignal(probe),
          labelKey: 'postAcceptTrust.signalOffer',
        },
        {
          key: 'inventory',
          tone: mapInventorySignal(probe),
          labelKey: 'postAcceptTrust.signalInventory',
        },
      ],
      holdUntil: null,
    };
  }

  if (order.status === 'SETTLEMENT_HOLD') {
    return {
      phase: 'settlement_hold',
      titleKey:
        role === 'seller'
          ? 'postAcceptTrust.holdSellerTitle'
          : 'postAcceptTrust.holdBuyerTitle',
      bodyKey:
        role === 'seller'
          ? 'postAcceptTrust.holdSellerBody'
          : 'postAcceptTrust.holdBuyerBody',
      reasonKey:
        role === 'seller'
          ? 'postAcceptTrust.holdSellerReason'
          : 'postAcceptTrust.holdBuyerReason',
      dualSignals: null,
      holdUntil: order.settlementHoldUntil ?? null,
    };
  }

  return null;
}

export function formatSettlementHoldUntil(
  iso: string | null | undefined,
  locale: string,
): string | null {
  if (!iso) {
    return null;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toLocaleString(locale === 'en' ? 'en-US' : 'ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}
