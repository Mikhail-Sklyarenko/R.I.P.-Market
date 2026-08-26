/**
 * F2: Manual accept assist for buyers.
 * Never auto-clicks Steam Accept — only after an explicit user gesture
 * (list deep-link) or double-confirm on the offer page.
 */
import type { TradeVerificationResult } from '@rip-market/extension-orchestrator';
import {
  createExtensionT,
  DEFAULT_EXTENSION_LOCALE,
  type ExtensionLocale,
} from './extension-i18n.js';

export const MANUAL_ACCEPT_ASSIST = {
  HIGHLIGHT_ATTR: 'data-rip-accept-highlight',
  STYLE_ID: 'rip-market-accept-assist-style',
} as const;

export type ManualAcceptListCta = {
  offerId: string;
  orderShortId: string;
  href: string;
  label: string;
  hint: string;
};

export type SteamAcceptControlKind = 'accept' | 'confirm' | 'unknown';

export type SteamAcceptControl = {
  element: HTMLElement;
  kind: SteamAcceptControlKind;
  label: string;
};

export function steamTradeOfferUrl(offerId: string): string {
  const id = offerId.trim();
  return `https://steamcommunity.com/tradeoffer/${encodeURIComponent(id)}/`;
}

/**
 * Buyer may use accept assist only when the offer is verified and ready.
 */
export function canShowManualAcceptAssist(
  trade: Pick<
    TradeVerificationResult,
    'role' | 'offerId' | 'verificationStatus' | 'orderStatus' | 'nextAction'
  >,
): boolean {
  if (trade.role !== 'buyer') {
    return false;
  }
  if (trade.verificationStatus !== 'verified') {
    return false;
  }
  if (!trade.offerId?.trim()) {
    return false;
  }
  if (trade.orderStatus === 'DISPUTE') {
    return false;
  }
  if (
    trade.nextAction.kind === 'report_issue' ||
    trade.nextAction.kind === 'platform_verifying'
  ) {
    return false;
  }
  return (
    trade.orderStatus === 'WAITING_TRADE' ||
    trade.nextAction.kind === 'accept_in_steam'
  );
}

export function buildManualAcceptListCta(
  trade: TradeVerificationResult,
  locale: ExtensionLocale = DEFAULT_EXTENSION_LOCALE,
): ManualAcceptListCta | null {
  if (!canShowManualAcceptAssist(trade) || !trade.offerId) {
    return null;
  }
  const t = createExtensionT(locale);
  return {
    offerId: trade.offerId,
    orderShortId: trade.orderShortId,
    href: steamTradeOfferUrl(trade.offerId),
    label: t('acceptAssist.acceptSteam'),
    hint: t('acceptAssist.openVerified', { short: trade.orderShortId }),
  };
}

function normalizeLabel(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function classifyAcceptLabel(label: string): SteamAcceptControlKind {
  const lower = label.toLowerCase();
  if (/confirm|подтверд/.test(lower)) {
    return 'confirm';
  }
  if (/accept|принять/.test(lower)) {
    return 'accept';
  }
  return 'unknown';
}

function controlFromElement(element: HTMLElement): SteamAcceptControl | null {
  if (!(element instanceof HTMLElement)) {
    return null;
  }
  if (
    element.getAttribute('aria-disabled') === 'true' ||
    (element instanceof HTMLButtonElement && element.disabled)
  ) {
    return null;
  }
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (style && (style.display === 'none' || style.visibility === 'hidden')) {
    return null;
  }
  const onclick = element.getAttribute('onclick') ?? '';
  const label = normalizeLabel(element.textContent) || normalizeLabel(element.title);
  let kind = classifyAcceptLabel(label);
  if (/ConfirmTradeOffer/i.test(onclick)) {
    kind = 'confirm';
  } else if (/AcceptTradeOffer/i.test(onclick)) {
    kind = 'accept';
  }
  if (kind === 'unknown' && !onclick) {
    return null;
  }
  return {
    element,
    kind: kind === 'unknown' ? 'accept' : kind,
    label: label || (kind === 'confirm' ? 'Confirm' : 'Accept'),
  };
}

/**
 * Finds Steam Accept / Confirm controls on the trade offer page.
 * Prefer Accept first; Confirm is the second Steam step after Accept.
 */
export function findSteamAcceptControls(
  root: ParentNode = document,
): SteamAcceptControl[] {
  const seen = new Set<HTMLElement>();
  const found: SteamAcceptControl[] = [];

  const push = (element: Element | null | undefined) => {
    if (!(element instanceof HTMLElement) || seen.has(element)) {
      return;
    }
    const control = controlFromElement(element);
    if (!control) {
      return;
    }
    seen.add(element);
    found.push(control);
  };

  if (root instanceof Document || root instanceof Element) {
    push(root.querySelector('#trade_confirmbtn'));
    push(root.querySelector('#trade_offer_accept_button'));
    push(root.querySelector('#accept_trade_button'));
    for (const el of Array.from(
      root.querySelectorAll(
        '[onclick*="AcceptTradeOffer"], [onclick*="ConfirmTradeOffer"]',
      ),
    )) {
      push(el);
    }
    for (const el of Array.from(
      root.querySelectorAll(
        'a.btn_green_white_innerfade, a.btn_green_steamui, button.btn_green_white_innerfade, .trade_confirmbtn, .btn_green_white_innerfade',
      ),
    )) {
      push(el);
    }
    for (const el of Array.from(
      root.querySelectorAll('a, button, div[role="button"]'),
    )) {
      const text = normalizeLabel(el.textContent).toLowerCase();
      if (
        text === 'accept' ||
        text === 'accept trade' ||
        text === 'принять' ||
        text === 'принять обмен' ||
        text === 'confirm' ||
        text === 'confirm trade' ||
        text === 'подтвердить'
      ) {
        push(el);
      }
    }
  }

  return found;
}

export function pickSteamAcceptControl(
  controls: SteamAcceptControl[],
  prefer: SteamAcceptControlKind = 'accept',
): SteamAcceptControl | null {
  if (controls.length === 0) {
    return null;
  }
  return (
    controls.find((entry) => entry.kind === prefer) ??
    controls.find((entry) => entry.kind === 'confirm') ??
    controls[0] ??
    null
  );
}

export function ensureAcceptAssistHighlightStyles(
  doc: Document = document,
): void {
  if (doc.getElementById(MANUAL_ACCEPT_ASSIST.STYLE_ID)) {
    return;
  }
  const style = doc.createElement('style');
  style.id = MANUAL_ACCEPT_ASSIST.STYLE_ID;
  style.textContent = `
    [${MANUAL_ACCEPT_ASSIST.HIGHLIGHT_ATTR}="1"] {
      outline: 3px solid #5b8def !important;
      outline-offset: 4px !important;
      box-shadow: 0 0 0 6px rgba(91,141,239,.35) !important;
      animation: rip-accept-pulse 1.1s ease-in-out 3;
    }
    @keyframes rip-accept-pulse {
      0%, 100% { box-shadow: 0 0 0 4px rgba(91,141,239,.25); }
      50% { box-shadow: 0 0 0 10px rgba(91,141,239,.45); }
    }
  `;
  doc.documentElement.appendChild(style);
}

export function clearSteamAcceptHighlights(root: ParentNode = document): void {
  const scope =
    root instanceof Document || root instanceof Element
      ? root
      : document;
  for (const el of Array.from(
    scope.querySelectorAll(`[${MANUAL_ACCEPT_ASSIST.HIGHLIGHT_ATTR}]`),
  )) {
    el.removeAttribute(MANUAL_ACCEPT_ASSIST.HIGHLIGHT_ATTR);
  }
}

export function highlightSteamAcceptControl(control: SteamAcceptControl): void {
  ensureAcceptAssistHighlightStyles(control.element.ownerDocument);
  clearSteamAcceptHighlights(control.element.ownerDocument);
  control.element.setAttribute(MANUAL_ACCEPT_ASSIST.HIGHLIGHT_ATTR, '1');
  control.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/**
 * Clicks Steam Accept/Confirm only when invoked from a user gesture handler.
 * Returns false when no suitable control is visible.
 */
export function clickSteamAcceptControl(
  control: SteamAcceptControl | null,
  locale: ExtensionLocale = DEFAULT_EXTENSION_LOCALE,
): { ok: true; kind: SteamAcceptControlKind; label: string } | { ok: false; error: string } {
  const t = createExtensionT(locale);
  if (!control) {
    return {
      ok: false,
      error: t('acceptAssist.acceptNotFound'),
    };
  }
  try {
    control.element.click();
    return { ok: true, kind: control.kind, label: control.label };
  } catch {
    return {
      ok: false,
      error: t('acceptAssist.acceptClickFailed'),
    };
  }
}

export type OfferAcceptAssistPhase = 'ready' | 'armed' | 'done' | 'error';

export type OfferAcceptAssistView = {
  phase: OfferAcceptAssistPhase;
  primaryLabel: string;
  secondaryLabel: string | null;
  hint: string;
  tone: 'ok' | 'warn' | 'error';
};

export function buildOfferAcceptAssistView(params: {
  phase: OfferAcceptAssistPhase;
  errorMessage?: string | null;
  lastClickedKind?: SteamAcceptControlKind | null;
  locale?: ExtensionLocale;
}): OfferAcceptAssistView {
  const locale = params.locale ?? DEFAULT_EXTENSION_LOCALE;
  const t = createExtensionT(locale);
  if (params.phase === 'armed') {
    return {
      phase: 'armed',
      primaryLabel: t('acceptAssist.confirmAccept'),
      secondaryLabel: t('acceptAssist.cancel'),
      hint: t('acceptAssist.doubleConfirm'),
      tone: 'warn',
    };
  }
  if (params.phase === 'done') {
    const guardHint =
      params.lastClickedKind === 'confirm'
        ? t('acceptAssist.guardHint')
        : t('acceptAssist.confirmAgain');
    return {
      phase: 'done',
      primaryLabel: t('acceptAssist.acceptSteam'),
      secondaryLabel: null,
      hint: t('acceptAssist.commandSent', { guardHint }),
      tone: 'ok',
    };
  }
  if (params.phase === 'error') {
    return {
      phase: 'error',
      primaryLabel: t('acceptAssist.acceptSteam'),
      secondaryLabel: null,
      hint: params.errorMessage?.trim() || t('acceptAssist.assistFailed'),
      tone: 'error',
    };
  }
  return {
    phase: 'ready',
    primaryLabel: t('acceptAssist.acceptSteam'),
    secondaryLabel: null,
    hint: t('acceptAssist.highlightHint'),
    tone: 'ok',
  };
}
