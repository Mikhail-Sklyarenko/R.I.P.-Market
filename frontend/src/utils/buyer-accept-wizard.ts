import type { Order } from '../api/types.ts';

export type BuyerAcceptWizardStepId =
  | 'open_offer'
  | 'verify_overlay'
  | 'accept_steam';

export type BuyerAcceptWizardStepState = 'done' | 'current' | 'upcoming';

export type BuyerAcceptWizardStep = {
  id: BuyerAcceptWizardStepId;
  state: BuyerAcceptWizardStepState;
  titleKey: string;
  bodyKey: string;
};

export type BuyerAcceptWizardView = {
  visible: boolean;
  blockedByMismatch: boolean;
  steps: BuyerAcceptWizardStep[];
  steamOfferUrl: string | null;
  offerId: string | null;
  /** Primary action for the current step. */
  primary: {
    kind: 'open_offer' | 'wait_return';
    href: string | null;
    labelKey: string;
  };
  extensionConnected: boolean;
  /** C3: ack actions as part of the scenario (not buried in details). */
  ack: {
    showPreAccept: boolean;
    showReceived: boolean;
    preAcceptDone: boolean;
    receivedDone: boolean;
  };
};

/**
 * C3: when buyer ack CTAs should be first-class (outside <details>).
 */
export function resolveBuyerScenarioAck(params: {
  order: Order;
  ackEnabled: boolean;
  blockedByMismatch?: boolean;
}): {
  showPreAccept: boolean;
  showReceived: boolean;
  preAcceptDone: boolean;
  receivedDone: boolean;
} {
  const acks = params.order.tradeAcknowledgments;
  const hasOffer = Boolean(params.order.tradeOperation?.externalOfferId?.trim());
  const status = params.order.status;
  const preAcceptDone = Boolean(acks?.buyerPreAccept);
  const receivedDone = Boolean(acks?.buyerReceived);
  const blocked = Boolean(params.blockedByMismatch);

  const showPreAccept =
    params.ackEnabled &&
    !blocked &&
    status === 'WAITING_TRADE' &&
    hasOffer &&
    !preAcceptDone &&
    !receivedDone;

  const showReceived =
    params.ackEnabled &&
    !blocked &&
    hasOffer &&
    !receivedDone &&
    (preAcceptDone ||
      status === 'TRADE_CONFIRMED' ||
      status === 'SETTLEMENT_HOLD');

  return {
    showPreAccept,
    showReceived,
    preAcceptDone,
    receivedDone,
  };
}


const OPENED_OFFER_PREFIX = 'rip:buyer-wizard-opened:';

export function buyerWizardOpenedStorageKey(orderId: string): string {
  return `${OPENED_OFFER_PREFIX}${orderId}`;
}

export function markBuyerWizardOfferOpened(orderId: string): void {
  try {
    sessionStorage.setItem(buyerWizardOpenedStorageKey(orderId), '1');
  } catch {
    // ignore quota / private mode
  }
}

export function hasBuyerWizardOfferOpened(orderId: string): boolean {
  try {
    return sessionStorage.getItem(buyerWizardOpenedStorageKey(orderId)) === '1';
  } catch {
    return false;
  }
}

export function buildSteamTradeOfferUrl(offerId: string | null | undefined): string | null {
  const id = offerId?.trim();
  if (!id) {
    return null;
  }
  return `https://steamcommunity.com/tradeoffer/${id}/`;
}

/**
 * C2: three-step buyer accept wizard — open this offer → verify shield → Accept in Steam.
 */
export function resolveBuyerAcceptWizard(params: {
  order: Order;
  role: 'buyer' | 'seller' | 'other';
  extensionConnected?: boolean | null;
  offerOpenedLocally?: boolean;
  ackEnabled?: boolean;
}): BuyerAcceptWizardView | null {
  if (params.role !== 'buyer' || params.order.status !== 'WAITING_TRADE') {
    return null;
  }

  const offerId = params.order.tradeOperation?.externalOfferId?.trim() || null;
  const steamOfferUrl = buildSteamTradeOfferUrl(offerId);
  if (!offerId || !steamOfferUrl) {
    return null;
  }

  const blockedByMismatch = params.order.tradeVerification?.status === 'mismatch';
  const acks = params.order.tradeAcknowledgments;
  const verified =
    params.order.tradeVerification?.status === 'verified' ||
    Boolean(acks?.buyerPreAccept);
  const opened =
    Boolean(params.offerOpenedLocally) ||
    verified ||
    Boolean(acks?.buyerReceived);

  let step1: BuyerAcceptWizardStepState = 'current';
  let step2: BuyerAcceptWizardStepState = 'upcoming';
  let step3: BuyerAcceptWizardStepState = 'upcoming';

  if (blockedByMismatch) {
    step1 = opened ? 'done' : 'current';
    step2 = opened ? 'current' : 'upcoming';
    step3 = 'upcoming';
  } else if (acks?.buyerReceived) {
    step1 = 'done';
    step2 = 'done';
    step3 = 'done';
  } else if (verified) {
    step1 = 'done';
    step2 = 'done';
    step3 = 'current';
  } else if (opened) {
    step1 = 'done';
    step2 = 'current';
    step3 = 'upcoming';
  }

  const steps: BuyerAcceptWizardStep[] = [
    {
      id: 'open_offer',
      state: step1,
      titleKey: 'buyerAcceptWizard.step1Title',
      bodyKey: 'buyerAcceptWizard.step1Body',
    },
    {
      id: 'verify_overlay',
      state: step2,
      titleKey: 'buyerAcceptWizard.step2Title',
      bodyKey: params.extensionConnected
        ? 'buyerAcceptWizard.step2BodyConnected'
        : 'buyerAcceptWizard.step2BodyManual',
    },
    {
      id: 'accept_steam',
      state: step3,
      titleKey: 'buyerAcceptWizard.step3Title',
      bodyKey: 'buyerAcceptWizard.step3Body',
    },
  ];

  const current = steps.find((step) => step.state === 'current') ?? steps[0];
  const primary =
    current.id === 'accept_steam'
      ? {
          kind: 'wait_return' as const,
          href: steamOfferUrl,
          labelKey: 'buyerAcceptWizard.ctaAcceptInSteam',
        }
      : {
          kind: 'open_offer' as const,
          href: steamOfferUrl,
          labelKey:
            current.id === 'verify_overlay'
              ? 'buyerAcceptWizard.ctaReopenOffer'
              : 'buyerAcceptWizard.ctaOpenOffer',
        };

  return {
    visible: true,
    blockedByMismatch,
    steps,
    steamOfferUrl,
    offerId,
    primary,
    extensionConnected: Boolean(params.extensionConnected),
    ack: resolveBuyerScenarioAck({
      order: params.order,
      ackEnabled: Boolean(params.ackEnabled),
      blockedByMismatch,
    }),
  };
}
