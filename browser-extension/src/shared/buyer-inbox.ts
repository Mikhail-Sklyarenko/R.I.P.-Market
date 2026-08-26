import type { TradeVerificationResult } from '@rip-market/extension-orchestrator';
import {
  createExtensionT,
  DEFAULT_EXTENSION_LOCALE,
  type ExtensionLocale,
} from './extension-i18n.js';
import {
  resolveTradeNextAction,
  type ResolvedNextAction,
} from './popup-next-action.js';
import {
  buildSettlementTransparency,
  type SettlementTransparencyView,
} from './settlement-transparency.js';
import {
  buildDisputeStatusView,
  buildInFlowDisputeSupportUrl,
  type DisputeStatusView,
} from './in-flow-dispute.js';

/**
 * C4: buyer purchase phases in the extension popup inbox.
 * Deep-link to a specific tradeoffer/{id} — never the Steam inbox as primary.
 * E2: primary CTA comes from next-action engine (one main button).
 * H1: labels follow extension locale.
 */
export type BuyerInboxPhase =
  | 'wait_offer'
  | 'accept'
  | 'verifying'
  | 'dispute';

export type BuyerInboxPrimaryCta = {
  href: string;
  label: string;
  kind: 'open_verified_offer' | 'open_order' | 'open_dispute';
};

export type BuyerInboxCard = {
  orderId: string;
  orderShortId: string;
  itemName: string;
  amountMinor: string;
  phase: BuyerInboxPhase;
  phaseLabel: string;
  title: string;
  description: string;
  tone: 'ok' | 'warn' | 'error' | 'info' | 'pending';
  primary: BuyerInboxPrimaryCta;
  offerId: string | null;
  steamOfferUrl: string | null;
  showPreAccept: boolean;
  showConfirmReceived: boolean;
  /** Minutes left until TRADE_TIMEOUT auto-dispute (null if unknown). */
  timeoutRemainingMinutes: number | null;
  timeoutLabel: string | null;
  /** Site support URL with deal/offer/verify query prefill (C5). */
  problemHref: string;
  /** E2: single primary + overflow actions. */
  cta: ResolvedNextAction;
  /** G1: settlement / delivery transparency (post-accept). */
  settlement: SettlementTransparencyView | null;
  /** G2: in-flow dispute status (mismatch / open dispute). */
  dispute: DisputeStatusView | null;
};

const PHASE_PRIORITY: Record<BuyerInboxPhase, number> = {
  dispute: 0,
  accept: 1,
  wait_offer: 2,
  verifying: 3,
};

export function buildSteamTradeOfferUrl(
  offerId: string | null | undefined,
): string | null {
  const id = offerId?.trim();
  if (!id) {
    return null;
  }
  return `https://steamcommunity.com/tradeoffer/${id}/`;
}

/** C5: minutes until tradeTimeoutAt (0 if expired). */
export function resolveTradeTimeoutRemainingMinutes(
  tradeTimeoutAt: string | null | undefined,
  nowMs = Date.now(),
): number | null {
  if (!tradeTimeoutAt) {
    return null;
  }
  const deadline = Date.parse(tradeTimeoutAt);
  if (!Number.isFinite(deadline)) {
    return null;
  }
  return Math.max(0, Math.ceil((deadline - nowMs) / 60_000));
}

export function formatBuyerTimeoutLabel(
  remainingMinutes: number | null,
  locale: ExtensionLocale = DEFAULT_EXTENSION_LOCALE,
): string | null {
  if (remainingMinutes === null) {
    return null;
  }
  const t = createExtensionT(locale);
  if (remainingMinutes <= 0) {
    return t('timeout.expired');
  }
  if (remainingMinutes < 60) {
    return t('timeout.minutes', { minutes: remainingMinutes });
  }
  const hours = Math.floor(remainingMinutes / 60);
  const minutes = remainingMinutes % 60;
  return t('timeout.hoursMinutes', { hours, minutes });
}

/**
 * C5/G2: support URL with deal / offer / verify + embedded evidence.
 */
export function buildBuyerProblemSupportUrl(
  trade: TradeVerificationResult,
): string {
  return buildInFlowDisputeSupportUrl(trade);
}

export function partitionActiveTrades(trades: TradeVerificationResult[]): {
  buyers: TradeVerificationResult[];
  sellers: TradeVerificationResult[];
} {
  const buyers: TradeVerificationResult[] = [];
  const sellers: TradeVerificationResult[] = [];
  for (const trade of trades) {
    if (trade.role === 'buyer') {
      buyers.push(trade);
    } else {
      sellers.push(trade);
    }
  }
  return { buyers, sellers };
}

export function resolveBuyerInboxPhase(
  trade: Pick<
    TradeVerificationResult,
    'orderStatus' | 'offerId' | 'verificationStatus' | 'nextAction'
  >,
): BuyerInboxPhase {
  if (
    trade.verificationStatus === 'mismatch' ||
    trade.nextAction.kind === 'report_issue' ||
    trade.orderStatus === 'DISPUTE'
  ) {
    return 'dispute';
  }

  if (
    trade.nextAction.kind === 'platform_verifying' ||
    trade.orderStatus === 'TRADE_CONFIRMED' ||
    trade.orderStatus === 'SETTLEMENT_HOLD'
  ) {
    return 'verifying';
  }

  if (
    trade.nextAction.kind === 'wait' ||
    (trade.orderStatus === 'WAITING_TRADE' && !trade.offerId)
  ) {
    return 'wait_offer';
  }

  return 'accept';
}

function resolveBuyerAckFlags(trade: TradeVerificationResult): {
  showPreAccept: boolean;
  showConfirmReceived: boolean;
} {
  const phase = resolveBuyerInboxPhase(trade);
  if (phase === 'dispute') {
    return { showPreAccept: false, showConfirmReceived: false };
  }

  const showPreAccept =
    phase === 'accept' &&
    trade.orderStatus === 'WAITING_TRADE' &&
    Boolean(trade.offerId) &&
    !trade.acknowledgments.buyerPreAccept &&
    !trade.acknowledgments.buyerReceived;

  const showConfirmReceived =
    Boolean(trade.offerId) &&
    !trade.acknowledgments.buyerReceived &&
    (trade.acknowledgments.buyerPreAccept ||
      trade.orderStatus === 'TRADE_CONFIRMED' ||
      trade.orderStatus === 'SETTLEMENT_HOLD' ||
      phase === 'verifying');

  return { showPreAccept, showConfirmReceived };
}

function resolvePrimaryCta(
  trade: TradeVerificationResult,
  phase: BuyerInboxPhase,
  steamOfferUrl: string | null,
  next: ResolvedNextAction,
  locale: ExtensionLocale,
): BuyerInboxPrimaryCta {
  const t = createExtensionT(locale);
  const primary = next.primary;
  if (primary.mode === 'link' && primary.href) {
    const kind: BuyerInboxPrimaryCta['kind'] =
      primary.id === 'open_verified_offer'
        ? 'open_verified_offer'
        : primary.id === 'open_dispute'
          ? 'open_dispute'
          : 'open_order';
    return {
      kind,
      href: primary.href,
      label: primary.label,
    };
  }

  // Fallback for button/runtime primaries — keep a link for legacy consumers.
  if (phase === 'dispute') {
    return {
      kind: 'open_dispute',
      href: buildInFlowDisputeSupportUrl(trade),
      label: t('cta.openDispute'),
    };
  }
  if (phase === 'accept' && steamOfferUrl) {
    return {
      kind: 'open_verified_offer',
      href: steamOfferUrl,
      label: t('cta.openVerifiedOfferSteam'),
    };
  }
  if (phase === 'verifying') {
    return {
      kind: 'open_order',
      href: trade.siteUrl,
      label: t('cta.platformStatus'),
    };
  }
  return {
    kind: 'open_order',
    href: trade.siteUrl,
    label: primary.label || t('cta.openOrder'),
  };
}

/**
 * Build a buyer inbox card. Returns null for sellers or finished purchases.
 */
export function buildBuyerInboxCard(
  trade: TradeVerificationResult,
  locale: ExtensionLocale = DEFAULT_EXTENSION_LOCALE,
): BuyerInboxCard | null {
  if (trade.role !== 'buyer') {
    return null;
  }
  if (trade.nextAction.kind === 'completed') {
    return null;
  }

  const t = createExtensionT(locale);
  const phase = resolveBuyerInboxPhase(trade);
  const steamOfferUrl = buildSteamTradeOfferUrl(trade.offerId);
  const acks = resolveBuyerAckFlags(trade);
  const next = resolveTradeNextAction(trade, locale);
  const timeoutRemainingMinutes = resolveTradeTimeoutRemainingMinutes(
    trade.tradeTimeoutAt,
  );
  const tone =
    phase === 'dispute'
      ? 'error'
      : phase === 'accept'
        ? 'warn'
        : phase === 'verifying'
          ? 'info'
          : 'pending';

  return {
    orderId: trade.orderId,
    orderShortId: trade.orderShortId,
    itemName: trade.item.marketHashName,
    amountMinor: trade.amountMinor,
    phase,
    phaseLabel: t(`buyerPhase.${phase}`),
    title: trade.nextAction.title,
    description: trade.nextAction.description,
    tone,
    primary: resolvePrimaryCta(trade, phase, steamOfferUrl, next, locale),
    offerId: trade.offerId,
    steamOfferUrl,
    showPreAccept: acks.showPreAccept,
    showConfirmReceived: acks.showConfirmReceived,
    timeoutRemainingMinutes,
    timeoutLabel: formatBuyerTimeoutLabel(timeoutRemainingMinutes, locale),
    problemHref: buildBuyerProblemSupportUrl(trade),
    cta: next,
    settlement: buildSettlementTransparency(trade, { locale }),
    dispute: buildDisputeStatusView(trade, locale),
  };
}

export function buildBuyerInbox(
  trades: TradeVerificationResult[],
  locale: ExtensionLocale = DEFAULT_EXTENSION_LOCALE,
): BuyerInboxCard[] {
  const cards = trades
    .map((trade) => buildBuyerInboxCard(trade, locale))
    .filter((card): card is BuyerInboxCard => card !== null);
  return sortBuyerInboxCards(cards);
}

export function sortBuyerInboxCards(cards: BuyerInboxCard[]): BuyerInboxCard[] {
  return [...cards].sort((a, b) => {
    const byPhase = PHASE_PRIORITY[a.phase] - PHASE_PRIORITY[b.phase];
    if (byPhase !== 0) {
      return byPhase;
    }
    return a.orderShortId.localeCompare(b.orderShortId);
  });
}
