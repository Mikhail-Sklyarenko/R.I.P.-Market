/**
 * E2: Next-action engine — exactly one primary CTA per card.
 * Seller: Guard / retry send / Trade URL
 * Buyer: verified offer / wait seller / dispute
 * Extra actions (ack, support) live in overflow — never compete with primary.
 * H1: labels follow extension locale (ru/en).
 */
import type { TradeVerificationResult } from '@rip-market/extension-orchestrator';
import {
  createExtensionT,
  DEFAULT_EXTENSION_LOCALE,
  type ExtensionLocale,
} from './extension-i18n.js';
import { buildInFlowDisputeSupportUrl } from './in-flow-dispute.js';
import type { SessionHealth } from './session-health.js';

function buildSteamTradeOfferUrl(offerId: string | null | undefined): string | null {
  const id = offerId?.trim();
  if (!id) {
    return null;
  }
  return `https://steamcommunity.com/tradeoffer/${id}/`;
}

function buildProblemSupportUrl(trade: TradeVerificationResult): string {
  return buildInFlowDisputeSupportUrl(trade);
}

export type NextActionCtaId =
  | 'confirm_guard'
  | 'retry_send'
  | 'open_trade_url'
  | 'open_verified_offer'
  | 'wait_seller'
  | 'open_dispute'
  | 'open_order'
  | 'platform_status'
  | 'confirm_sent_ack'
  | 'confirm_received_ack'
  | 'pre_accept_ack'
  | 're_pair'
  | 'steam_login'
  | 'steam_mismatch'
  | 'inventory_fix'
  | 'problem_support';

export type NextActionAckType =
  | 'SELLER_ACK_SENT'
  | 'BUYER_ACK_PRE_ACCEPT'
  | 'BUYER_ACK_RECEIVED';

export type NextActionCta = {
  id: NextActionCtaId;
  label: string;
  mode: 'link' | 'button' | 'runtime';
  href?: string | null;
  ackType?: NextActionAckType | null;
  runtime?: 'poll_now' | null;
  orderId?: string | null;
  offerId?: string | null;
};

export type ResolvedNextAction = {
  primary: NextActionCta;
  overflow: NextActionCta[];
  hint: string | null;
};

function linkCta(
  id: NextActionCtaId,
  label: string,
  href: string,
): NextActionCta {
  return { id, label, mode: 'link', href };
}

function buttonAckCta(
  id: NextActionCtaId,
  label: string,
  ackType: NextActionAckType,
  trade: Pick<TradeVerificationResult, 'orderId' | 'offerId'>,
): NextActionCta {
  return {
    id,
    label,
    mode: 'button',
    ackType,
    orderId: trade.orderId,
    offerId: trade.offerId,
  };
}

function runtimeCta(
  id: NextActionCtaId,
  label: string,
  runtime: 'poll_now',
  trade?: Pick<TradeVerificationResult, 'orderId' | 'offerId'>,
): NextActionCta {
  return {
    id,
    label,
    mode: 'runtime',
    runtime,
    orderId: trade?.orderId ?? null,
    offerId: trade?.offerId ?? null,
  };
}

/**
 * Resolve the single primary CTA (+ optional overflow) for an active trade card.
 */
export function resolveTradeNextAction(
  trade: TradeVerificationResult,
  locale: ExtensionLocale = DEFAULT_EXTENSION_LOCALE,
): ResolvedNextAction {
  const t = createExtensionT(locale);
  const offerUrl = buildSteamTradeOfferUrl(trade.offerId);
  const problemHref = buildProblemSupportUrl(trade);

  if (
    trade.verificationStatus === 'mismatch' ||
    trade.nextAction.kind === 'report_issue' ||
    trade.orderStatus === 'DISPUTE'
  ) {
    return {
      primary: linkCta('open_dispute', t('cta.openDispute'), problemHref),
      overflow: [linkCta('open_order', t('cta.openOrder'), trade.siteUrl)],
      hint:
        trade.orderStatus === 'DISPUTE'
          ? t('nextAction.hintDisputeOpen')
          : t('nextAction.hintMismatch'),
    };
  }

  if (trade.nextAction.kind === 'confirm_guard') {
    return {
      primary: linkCta('confirm_guard', t('cta.confirmGuard'), trade.siteUrl),
      overflow: [linkCta('open_order', t('cta.openOrder'), trade.siteUrl)],
      hint: t('nextAction.hintGuard'),
    };
  }

  if (trade.nextAction.kind === 'send_manual') {
    const primary = trade.buyerTradeUrl
      ? linkCta('open_trade_url', t('cta.openTradeUrl'), trade.buyerTradeUrl)
      : runtimeCta('retry_send', t('cta.retrySend'), 'poll_now', trade);
    const overflow: NextActionCta[] = [];
    if (trade.buyerTradeUrl) {
      overflow.push(
        runtimeCta('retry_send', t('cta.retryAutoSend'), 'poll_now', trade),
      );
    }
    overflow.push(linkCta('open_order', t('cta.openOrder'), trade.siteUrl));
    if (!trade.acknowledgments.sellerAckSent && Boolean(trade.offerId)) {
      overflow.push(
        buttonAckCta(
          'confirm_sent_ack',
          t('cta.confirmSent'),
          'SELLER_ACK_SENT',
          trade,
        ),
      );
    }
    return {
      primary,
      overflow,
      hint: trade.buyerTradeUrl
        ? t('nextAction.hintManualWithUrl')
        : t('nextAction.hintManualRetry'),
    };
  }

  if (trade.nextAction.kind === 'confirm_sent') {
    return {
      primary: buttonAckCta(
        'confirm_sent_ack',
        t('cta.confirmSent'),
        'SELLER_ACK_SENT',
        trade,
      ),
      overflow: [
        ...(trade.buyerTradeUrl
          ? [linkCta('open_trade_url', t('cta.openTradeUrl'), trade.buyerTradeUrl)]
          : []),
        linkCta('open_order', t('cta.openOrder'), trade.siteUrl),
      ],
      hint: null,
    };
  }

  if (trade.nextAction.kind === 'accept_in_steam') {
    const primary = offerUrl
      ? linkCta('open_verified_offer', t('cta.openVerifiedOffer'), offerUrl)
      : linkCta('open_order', t('cta.openOrder'), trade.siteUrl);
    const overflow: NextActionCta[] = [];
    if (!trade.acknowledgments.buyerPreAccept && trade.offerId) {
      overflow.push(
        buttonAckCta(
          'pre_accept_ack',
          t('cta.preAcceptAck'),
          'BUYER_ACK_PRE_ACCEPT',
          trade,
        ),
      );
    }
    overflow.push(
      linkCta('problem_support', t('cta.problemSupport'), problemHref),
    );
    return {
      primary,
      overflow,
      hint: t('nextAction.hintAccept'),
    };
  }

  if (trade.nextAction.kind === 'confirm_received') {
    return {
      primary: buttonAckCta(
        'confirm_received_ack',
        t('cta.confirmReceived'),
        'BUYER_ACK_RECEIVED',
        trade,
      ),
      overflow: [
        ...(offerUrl
          ? [linkCta('open_verified_offer', t('cta.openOfferSteam'), offerUrl)]
          : []),
        linkCta('open_order', t('cta.openOrder'), trade.siteUrl),
        linkCta('problem_support', t('cta.problemSupport'), problemHref),
      ],
      hint: null,
    };
  }

  if (trade.nextAction.kind === 'platform_verifying') {
    return {
      primary: linkCta(
        'platform_status',
        t('cta.platformStatus'),
        trade.siteUrl,
      ),
      overflow: [
        linkCta('problem_support', t('cta.problemSupport'), problemHref),
      ],
      hint: t('nextAction.hintVerifying'),
    };
  }

  if (
    trade.nextAction.kind === 'wait' ||
    (trade.role === 'buyer' && !trade.offerId)
  ) {
    return {
      primary: linkCta('wait_seller', t('cta.waitSeller'), trade.siteUrl),
      overflow: [
        linkCta('problem_support', t('cta.problemSupport'), problemHref),
      ],
      hint: t('nextAction.hintWaitSeller'),
    };
  }

  return {
    primary: linkCta('open_order', t('cta.openOrder'), trade.siteUrl),
    overflow: [],
    hint: null,
  };
}

/**
 * Session / health cards also get one primary CTA.
 */
export function resolveHealthNextAction(
  health: SessionHealth,
  locale: ExtensionLocale = DEFAULT_EXTENSION_LOCALE,
): ResolvedNextAction {
  const t = createExtensionT(locale);
  const href = health.ctaUrl;
  const label = health.ctaLabel ?? t('cta.open');

  if (health.code === 'EXT_DISCONNECTED' || health.code === 'SESSION_REVOKED') {
    return {
      primary: href
        ? linkCta('re_pair', label, href)
        : linkCta('re_pair', t('cta.openAccount'), 'https://p2pcs.ru/account'),
      overflow: [],
      hint: null,
    };
  }

  if (health.code === 'STEAM_ACCOUNT_MISMATCH') {
    return {
      primary: href
        ? linkCta('steam_mismatch', label, href)
        : linkCta(
            'steam_mismatch',
            t('cta.loginNeededSteam'),
            'https://steamcommunity.com/login/home/',
          ),
      overflow: [],
      hint: null,
    };
  }

  if (health.code === 'STEAM_COOKIE_EXPIRED') {
    return {
      primary: href
        ? linkCta('steam_login', label, href)
        : linkCta(
            'steam_login',
            t('cta.loginSteam'),
            'https://steamcommunity.com/login/home/',
          ),
      overflow: [],
      hint: null,
    };
  }

  return {
    primary: href
      ? linkCta('inventory_fix', label, href)
      : linkCta(
          'inventory_fix',
          t('cta.openSteamInventory'),
          'https://steamcommunity.com/my/inventory/#730_2',
        ),
    overflow: [],
    hint: null,
  };
}

/** True when primary is the only visible action (overflow may still exist). */
export function assertSinglePrimary(resolved: ResolvedNextAction): boolean {
  return Boolean(resolved.primary?.label);
}
