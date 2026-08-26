/**
 * G2: In-flow dispute — «Открыть спор» with prefilled evidence + popup status.
 * Evidence travels in the support URL (extension → site cannot share sessionStorage).
 * H1: status copy follows extension locale.
 */
import type { TradeVerificationResult } from '@rip-market/extension-orchestrator';
import {
  createExtensionT,
  DEFAULT_EXTENSION_LOCALE,
  type ExtensionLocale,
} from './extension-i18n.js';

export type InFlowDisputeReason = 'trade_problem' | 'mismatch' | 'timeout';

export type InFlowDisputeEvidence = {
  version: 1;
  reason: InFlowDisputeReason;
  orderId: string;
  offerId: string | null;
  orderStatus: string;
  role: 'buyer' | 'seller';
  verificationStatus: string | null;
  failedCheckKeys: string[];
  nextActionKind: string | null;
  tradeTimeoutAt: string | null;
  capturedAt: string;
};

export type DisputeStatusPhase = 'needs_dispute' | 'dispute_open';

export type DisputeStatusView = {
  phase: DisputeStatusPhase;
  title: string;
  body: string;
  tone: 'error' | 'warn';
  primaryLabel: string;
  primaryHref: string;
  secondaryLabel: string;
  secondaryHref: string;
};

function siteOriginFromTradeUrl(siteUrl: string): string {
  return siteUrl.replace(/\/orders\/[^/?#]+\/?$/, '') || siteUrl;
}

export function resolveInFlowDisputeReason(
  trade: Pick<TradeVerificationResult, 'verificationStatus' | 'orderStatus'>,
): InFlowDisputeReason {
  if (trade.verificationStatus === 'mismatch') {
    return 'mismatch';
  }
  if (trade.orderStatus === 'DISPUTE') {
    return 'timeout';
  }
  return 'trade_problem';
}

export function buildInFlowDisputeEvidence(
  trade: Pick<
    TradeVerificationResult,
    | 'orderId'
    | 'offerId'
    | 'orderStatus'
    | 'role'
    | 'verificationStatus'
    | 'checks'
    | 'nextAction'
    | 'tradeTimeoutAt'
  >,
  capturedAt = new Date().toISOString(),
): InFlowDisputeEvidence {
  return {
    version: 1,
    reason: resolveInFlowDisputeReason(trade),
    orderId: trade.orderId,
    offerId: trade.offerId?.trim() || null,
    orderStatus: trade.orderStatus,
    role: trade.role,
    verificationStatus: trade.verificationStatus ?? null,
    failedCheckKeys: trade.checks
      .filter((check) => !check.passed)
      .map((check) => check.key),
    nextActionKind: trade.nextAction.kind,
    tradeTimeoutAt: trade.tradeTimeoutAt?.trim() || null,
    capturedAt,
  };
}

/** Compact UTF-8 → base64url for querystring evidence. */
export function encodeInFlowDisputeEvidence(
  evidence: InFlowDisputeEvidence,
): string {
  const json = JSON.stringify(evidence);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

export function decodeInFlowDisputeEvidence(
  encoded: string | null | undefined,
): InFlowDisputeEvidence | null {
  const raw = encoded?.trim();
  if (!raw) {
    return null;
  }
  try {
    const padded = raw.replaceAll('-', '+').replaceAll('_', '/');
    const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
    const binary = atob(padded + pad);
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as InFlowDisputeEvidence;
    if (parsed?.version !== 1 || !parsed.orderId) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Support URL with deal/offer/verify + embedded evidence pack.
 */
export function buildInFlowDisputeSupportUrl(
  trade: TradeVerificationResult,
  opts?: { capturedAt?: string },
): string {
  const evidence = buildInFlowDisputeEvidence(trade, opts?.capturedAt);
  const origin = siteOriginFromTradeUrl(trade.siteUrl);
  const query = new URLSearchParams();
  query.set('dealId', evidence.orderId);
  query.set('topic', 'deal');
  query.set('reason', evidence.reason);
  if (evidence.offerId) {
    query.set('offerId', evidence.offerId);
  }
  if (evidence.verificationStatus) {
    query.set('verifyStatus', evidence.verificationStatus);
  }
  if (evidence.failedCheckKeys.length > 0) {
    query.set('failedChecks', evidence.failedCheckKeys.join(','));
  }
  if (evidence.nextActionKind) {
    query.set('nextAction', evidence.nextActionKind);
  }
  query.set('capturedAt', evidence.capturedAt);
  query.set('evidence', encodeInFlowDisputeEvidence(evidence));
  return `${origin}/support?${query.toString()}`;
}

export function canShowInFlowDispute(
  trade: Pick<
    TradeVerificationResult,
    'orderStatus' | 'verificationStatus' | 'nextAction'
  >,
): boolean {
  return (
    trade.orderStatus === 'DISPUTE' ||
    trade.verificationStatus === 'mismatch' ||
    trade.nextAction.kind === 'report_issue'
  );
}

/**
 * Popup / overlay status for dispute or mismatch needing dispute.
 */
export function buildDisputeStatusView(
  trade: TradeVerificationResult,
  locale: ExtensionLocale = DEFAULT_EXTENSION_LOCALE,
): DisputeStatusView | null {
  if (!canShowInFlowDispute(trade)) {
    return null;
  }
  const t = createExtensionT(locale);
  const supportHref = buildInFlowDisputeSupportUrl(trade);
  const orderHref = trade.siteUrl;

  if (trade.orderStatus === 'DISPUTE') {
    return {
      phase: 'dispute_open',
      title: t('dispute.openTitle'),
      body: t('dispute.openBody'),
      tone: 'error',
      primaryLabel: t('cta.openDisputeSupport'),
      primaryHref: supportHref,
      secondaryLabel: t('cta.openOrder'),
      secondaryHref: orderHref,
    };
  }

  return {
    phase: 'needs_dispute',
    title: t('dispute.needTitle'),
    body:
      trade.verificationStatus === 'mismatch'
        ? t('dispute.needMismatch')
        : t('dispute.needGeneric'),
    tone: 'warn',
    primaryLabel: t('cta.openDispute'),
    primaryHref: supportHref,
    secondaryLabel: t('cta.openOrder'),
    secondaryHref: orderHref,
  };
}

export function disputeStatusHtml(
  view: DisputeStatusView,
  escapeHtml: (value: string) => string,
): string {
  return `
    <div class="dispute-block tone-${escapeHtml(view.tone)}" data-dispute-phase="${escapeHtml(view.phase)}">
      <p class="dispute-title">${escapeHtml(view.title)}</p>
      <p class="dispute-body">${escapeHtml(view.body)}</p>
    </div>
  `;
}

/** Ticket body template (same shape as site escalation pack). */
export function formatInFlowDisputeTicketBody(
  evidence: InFlowDisputeEvidence,
  userNote = '',
): string {
  const lines = [
    '--- R.I.P trade escalation ---',
    `Reason: ${evidence.reason}`,
    `Deal ID: ${evidence.orderId}`,
    `Offer ID: ${evidence.offerId ?? 'none'}`,
    `Order status: ${evidence.orderStatus}`,
    `Role: ${evidence.role}`,
    `Verify status: ${evidence.verificationStatus ?? 'n/a'}`,
    `Failed checks: ${
      evidence.failedCheckKeys.length > 0
        ? evidence.failedCheckKeys.join(', ')
        : 'none'
    }`,
    `Next action: ${evidence.nextActionKind ?? 'n/a'}`,
    `Trade timeout at: ${evidence.tradeTimeoutAt ?? 'n/a'}`,
    `Captured at: ${evidence.capturedAt}`,
    '---',
  ];
  const note = userNote.trim();
  if (note) {
    lines.push('', note);
  } else {
    lines.push('', createExtensionT(DEFAULT_EXTENSION_LOCALE)('dispute.ticketPlaceholder'));
  }
  return lines.join('\n');
}
