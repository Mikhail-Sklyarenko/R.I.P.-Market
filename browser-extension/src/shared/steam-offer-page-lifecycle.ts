/**
 * Product: Steam DOM is the ground truth the user sees.
 * After Accept, Steam shows “Trade Accepted” or “no longer valid” —
 * the platform must leave Accept/Guard UX and advance delivery.
 */

export type SteamOfferPageLifecycle =
  | 'active'
  | 'accepted'
  | 'invalid'
  | 'unknown';

export type SteamOfferPageLifecycleResult = {
  lifecycle: SteamOfferPageLifecycle;
  /** Mapped into delivery / Guard probe vocabulary. */
  offerStatusHint: 'accepted' | 'expired' | null;
  /** User-facing short reason (RU). */
  reasonRu: string | null;
};

const ACCEPTED_RE =
  /trade\s*accepted|обмен\s*принят|предложение\s*принято|trade\s*completed|обмен\s*заверш/i;
const INVALID_RE =
  /no\s*longer\s*valid|больше\s*не\s*действ|is\s*no\s*longer\s*available|это\s*предложение\s*обмена\s*больше\s*не\s*действ/i;
const ERROR_BANNER_RE = /oh\s*nooooooes|some\s*kind\s*of\s*error\s*has\s*occurred/i;

/**
 * Detect lifecycle from a Steam tradeoffer document (or list detail host).
 */
export function detectSteamOfferPageLifecycle(
  root: ParentNode = document,
): SteamOfferPageLifecycleResult {
  const doc = root as Document;
  const hasSlots =
    typeof doc.querySelector === 'function' &&
    Boolean(
      doc.querySelector(
        '#trade_ygifts, #trade_themitems, .trade_item_box, #you_notready, #trade_confirmbtn',
      ),
    );

  const text = collectSteamStatusText(root);
  if (text) {
    if (ACCEPTED_RE.test(text)) {
      return {
        lifecycle: 'accepted',
        offerStatusHint: 'accepted',
        reasonRu: 'Steam показывает: обмен принят',
      };
    }

    if (INVALID_RE.test(text) || ERROR_BANNER_RE.test(text)) {
      // After Accept Steam often redirects here; treat as post-accept for UX.
      // Delivery still reconciles via poll / buyer ack.
      return {
        lifecycle: 'invalid',
        offerStatusHint: 'accepted',
        reasonRu: 'Предложение в Steam уже закрыто (принято или отменено)',
      };
    }
  }

  if (hasSlots) {
    return { lifecycle: 'active', offerStatusHint: null, reasonRu: null };
  }

  return { lifecycle: 'unknown', offerStatusHint: null, reasonRu: null };
}

function collectSteamStatusText(root: ParentNode): string {
  const chunks: string[] = [];
  const doc = root as Document;
  if (typeof doc.querySelectorAll === 'function') {
    const nodes = doc.querySelectorAll(
      '.error_ctn, .error_msg, #error_msg, .tradeoffer_items_banner, .trade_accepted, .pageheader, h2, .maincontent',
    );
    for (const node of Array.from(nodes).slice(0, 12)) {
      const value = node.textContent?.replace(/\s+/g, ' ').trim();
      if (value) {
        chunks.push(value);
      }
    }
  }
  if (chunks.length === 0 && 'body' in doc && doc.body) {
    chunks.push((doc.body.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 2000));
  }
  return chunks.join('\n');
}

/** Buyer should leave Accept UX and confirm receipt / wait for platform. */
export function isPostAcceptSteamLifecycle(
  lifecycle: SteamOfferPageLifecycle,
): boolean {
  return lifecycle === 'accepted' || lifecycle === 'invalid';
}
