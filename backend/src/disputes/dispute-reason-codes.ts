export type DisputeReasonCategory =
  | 'TRADE_REFERENCE'
  | 'DELIVERY_VERIFICATION'
  | 'EXTENSION'
  | 'SETTLEMENT'
  | 'TIMEOUT'
  | 'ADMIN';

export type DisputeReviewType = 'AUTO' | 'MANUAL_REVIEW';

export type DisputeReasonSource =
  | 'SYSTEM'
  | 'ADMIN'
  | 'EXTENSION'
  | 'POLLER'
  | 'RECONCILE';

export type DisputeReasonDefinition = {
  code: string;
  category: DisputeReasonCategory;
  reviewType: DisputeReviewType;
  title: string;
  description: string;
  allowedSources: DisputeReasonSource[];
};

export const DISPUTE_REASON_REGISTRY: DisputeReasonDefinition[] = [
  {
    code: 'TRADE_REFERENCE_SPOOF',
    category: 'TRADE_REFERENCE',
    reviewType: 'AUTO',
    title: 'Offer linked to another order',
    description: 'externalOfferId already belongs to a different order.',
    allowedSources: ['RECONCILE', 'SYSTEM'],
  },
  {
    code: 'TRADE_REFERENCE_MISMATCH',
    category: 'TRADE_REFERENCE',
    reviewType: 'AUTO',
    title: 'Offer id changed on order',
    description: 'Incoming trade reference conflicts with stored offer id.',
    allowedSources: ['RECONCILE', 'SYSTEM'],
  },
  {
    code: 'DELIVERY_INVENTORY_MISMATCH',
    category: 'DELIVERY_VERIFICATION',
    reviewType: 'AUTO',
    title: 'Offer accepted but item not delivered',
    description: 'Steam offer accepted while seller still holds the asset.',
    allowedSources: ['POLLER', 'SYSTEM'],
  },
  {
    code: 'DELIVERY_SIGNAL_CONFLICT',
    category: 'DELIVERY_VERIFICATION',
    reviewType: 'AUTO',
    title: 'Inventory moved before offer accepted',
    description: 'Buyer inventory shows asset while offer is still pending.',
    allowedSources: ['POLLER', 'SYSTEM'],
  },
  {
    code: 'DELIVERY_VERIFICATION_UNKNOWN',
    category: 'DELIVERY_VERIFICATION',
    reviewType: 'MANUAL_REVIEW',
    title: 'Delivery verification inconclusive',
    description: 'Offer/inventory signals could not be reconciled safely.',
    allowedSources: ['POLLER', 'SYSTEM'],
  },
  {
    code: 'DELIVERY_ACCEPTED_INVENTORY_PENDING_EXHAUSTED',
    category: 'DELIVERY_VERIFICATION',
    reviewType: 'MANUAL_REVIEW',
    title: 'Accepted offer, inventory never confirmed',
    description: 'Inventory sync did not confirm delivery within retry budget.',
    allowedSources: ['POLLER', 'SYSTEM'],
  },
  {
    code: 'INVENTORY_UNKNOWN_EXHAUSTED',
    category: 'DELIVERY_VERIFICATION',
    reviewType: 'MANUAL_REVIEW',
    title: 'Inventory verification exhausted',
    description: 'Inventory delta remained unknown after max checks.',
    allowedSources: ['POLLER', 'SYSTEM'],
  },
  {
    code: 'OFFER_UNKNOWN',
    category: 'DELIVERY_VERIFICATION',
    reviewType: 'MANUAL_REVIEW',
    title: 'Unknown Steam offer state',
    description: 'Steam returned an unrecognized offer status.',
    allowedSources: ['POLLER', 'SYSTEM'],
  },
  {
    code: 'OFFER_DECLINED',
    category: 'DELIVERY_VERIFICATION',
    reviewType: 'AUTO',
    title: 'Trade offer declined',
    description: 'Buyer declined the Steam trade offer.',
    allowedSources: ['POLLER', 'SYSTEM'],
  },
  {
    code: 'OFFER_EXPIRED',
    category: 'DELIVERY_VERIFICATION',
    reviewType: 'AUTO',
    title: 'Trade offer expired',
    description: 'Steam trade offer expired before acceptance.',
    allowedSources: ['POLLER', 'SYSTEM'],
  },
  {
    code: 'TRADE_TIMEOUT',
    category: 'TIMEOUT',
    reviewType: 'AUTO',
    title: 'Trade window timeout',
    description: 'Order exceeded configured trade timeout.',
    allowedSources: ['POLLER', 'SYSTEM'],
  },
  {
    code: 'EXT_ITEM_MISMATCH',
    category: 'EXTENSION',
    reviewType: 'AUTO',
    title: 'Extension item mismatch',
    description: 'Extension could not match order item in seller inventory.',
    allowedSources: ['EXTENSION', 'SYSTEM'],
  },
  {
    code: 'EXT_MAX_ATTEMPTS_REACHED',
    category: 'EXTENSION',
    reviewType: 'MANUAL_REVIEW',
    title: 'Extension task retries exhausted',
    description: 'Automated offer task failed after max attempts.',
    allowedSources: ['EXTENSION', 'SYSTEM'],
  },
  {
    code: 'EXT_OFFER_TERMINAL_FAILURE',
    category: 'EXTENSION',
    reviewType: 'MANUAL_REVIEW',
    title: 'Extension offer terminal failure',
    description: 'Extension reported non-retryable offer failure.',
    allowedSources: ['EXTENSION', 'SYSTEM'],
  },
  {
    code: 'SETTLEMENT_HOLD_REVERSED',
    category: 'SETTLEMENT',
    reviewType: 'MANUAL_REVIEW',
    title: 'Settlement hold reversed',
    description: 'Funds were refunded during settlement hold window.',
    allowedSources: ['SYSTEM', 'ADMIN'],
  },
  {
    code: 'ADMIN_DISPUTE',
    category: 'ADMIN',
    reviewType: 'MANUAL_REVIEW',
    title: 'Admin manual dispute',
    description: 'Opened manually by support/admin.',
    allowedSources: ['ADMIN'],
  },
  {
    code: 'ADMIN_SHADOW_REVIEW',
    category: 'ADMIN',
    reviewType: 'MANUAL_REVIEW',
    title: 'Shadow verification review',
    description: 'Manual review after shadow-mode observation.',
    allowedSources: ['ADMIN'],
  },
  {
    code: 'ADMIN_RESOLVE_BUYER',
    category: 'ADMIN',
    reviewType: 'MANUAL_REVIEW',
    title: 'Resolved in favor of buyer',
    description: 'Admin refunded buyer and closed order as failed.',
    allowedSources: ['ADMIN'],
  },
  {
    code: 'ADMIN_RESOLVE_SELLER',
    category: 'ADMIN',
    reviewType: 'MANUAL_REVIEW',
    title: 'Resolved in favor of seller',
    description: 'Admin released settlement to seller.',
    allowedSources: ['ADMIN'],
  },
];

export const DISPUTE_REASON_CODES = DISPUTE_REASON_REGISTRY.map((r) => r.code);

export const EXTENSION_DISPUTE_ERROR_MAP: Record<string, string> = {
  ITEM_MISMATCH: 'EXT_ITEM_MISMATCH',
  MAX_ATTEMPTS_REACHED: 'EXT_MAX_ATTEMPTS_REACHED',
};

export function getDisputeReasonDefinition(
  code: string,
): DisputeReasonDefinition | undefined {
  return DISPUTE_REASON_REGISTRY.find((entry) => entry.code === code);
}

export function isKnownDisputeReasonCode(code: string): boolean {
  return DISPUTE_REASON_REGISTRY.some((entry) => entry.code === code);
}

export function assertDisputeReasonAllowed(
  code: string,
  source: DisputeReasonSource,
): void {
  const definition = getDisputeReasonDefinition(code);
  if (!definition) {
    throw new Error(`Unknown dispute reason code: ${code}`);
  }
  if (!definition.allowedSources.includes(source)) {
    throw new Error(`Reason code ${code} is not allowed for source ${source}`);
  }
}

export function mapExtensionErrorToDisputeReason(
  errorCode: string | null | undefined,
): string | null {
  if (!errorCode) {
    return null;
  }
  return EXTENSION_DISPUTE_ERROR_MAP[errorCode] ?? null;
}

export function shouldAutoOpenDispute(code: string): boolean {
  const definition = getDisputeReasonDefinition(code);
  return definition?.reviewType === 'AUTO';
}
