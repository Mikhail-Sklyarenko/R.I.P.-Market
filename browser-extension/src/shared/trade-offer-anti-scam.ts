import { parseAssetIdFromElement } from './trade-offer-observed-item.js';

export type AntiScamSeverity = 'info' | 'warn' | 'block';

export type AntiScamRuleId =
  | 'requests_your_items'
  | 'extra_items_from_them'
  | 'steam_trade_hold'
  | 'offer_not_linked'
  | 'never_accept_from_chat';

export type AntiScamWarning = {
  id: AntiScamRuleId;
  severity: AntiScamSeverity;
  title: string;
  body: string;
};

export type OfferSlotSnapshot = {
  /** Items you would give away in this offer. */
  yourItemCount: number;
  /** Items you would receive in this offer. */
  theirItemCount: number;
  /** Raw Steam escrow / trade-hold hint from the page, if any. */
  steamEscrowHint: string | null;
};

const YOUR_ITEM_SELECTORS = [
  '#your_slots .item',
  '#trade_yours .item',
  '.tradeoffer_items.secondary .item',
  '#trade_offer_your_slots .item',
];

const THEIR_ITEM_SELECTORS = [
  '#them_slots .item',
  '#trade_theirs .item',
  '.tradeoffer_items.primary .item',
  '#trade_offer_their_slots .item',
];

const STICKY_HINT: AntiScamWarning = {
  id: 'never_accept_from_chat',
  severity: 'info',
  title: 'Не принимайте обмены из чата',
  body: 'Обмены из чата, профиля или от незнакомцев — классический скам. Принимайте только офферы, привязанные к заказу R.I.P Market.',
};

function countUniqueItems(root: ParentNode, selectors: string[]): number {
  const seen = new Set<string>();
  for (const selector of selectors) {
    for (const element of Array.from(root.querySelectorAll(selector))) {
      const assetId = parseAssetIdFromElement(element);
      if (assetId) {
        seen.add(`asset:${assetId}`);
        continue;
      }
      const economy = element.getAttribute('data-economy-item')?.trim();
      if (economy) {
        seen.add(`economy:${economy}`);
        continue;
      }
      const title = element.getAttribute('title')?.trim();
      if (title) {
        seen.add(`title:${title}:${seen.size}`);
      } else {
        seen.add(`node:${selector}:${seen.size}`);
      }
    }
  }
  return seen.size;
}

/**
 * Detects Steam escrow / trade-hold copy on the offer page.
 * Pure text scan — Steam wording varies by locale and UI revision.
 */
export function detectSteamEscrowHint(text: string): string | null {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return null;
  }

  const patterns = [
    /items?\s+will\s+be\s+held[^.!?\n]{0,100}/i,
    /will\s+be\s+held\s+by\s+steam[^.!?\n]{0,100}/i,
    /trade\s+hold[^.!?\n]{0,80}/i,
    /held\s+in\s+escrow[^.!?\n]{0,80}/i,
    /предмет[аы]?\s+будут?\s+удержан[^.!?\n]{0,100}/i,
    /удержани[ея]\s+steam[^.!?\n]{0,80}/i,
    /trade\s+hold\s+на\s+\d+[^.!?\n]{0,40}/i,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match?.[0]) {
      return match[0].trim().slice(0, 160);
    }
  }
  return null;
}

export function parseOfferSlotSnapshot(root: ParentNode): OfferSlotSnapshot {
  const pageText =
    root instanceof Document
      ? (root.body?.textContent ?? root.documentElement?.textContent ?? '')
      : ((root as Element).textContent ?? '');

  return {
    yourItemCount: countUniqueItems(root, YOUR_ITEM_SELECTORS),
    theirItemCount: countUniqueItems(root, THEIR_ITEM_SELECTORS),
    steamEscrowHint: detectSteamEscrowHint(pageText),
  };
}

export type EvaluateAntiScamInput = {
  /** True when offerId maps to an active R.I.P Market order. */
  hasLinkedActiveOrder: boolean;
  /** Viewer role when known; null on unknown / foreign offers. */
  role: 'buyer' | 'seller' | null;
  slots: OfferSlotSnapshot | null;
  /** Always include the sticky chat/profile hint (default true). */
  includeStickyHint?: boolean;
};

/**
 * Evaluates anti-scam rules for Steam trade-offer UI.
 * Never auto-accepts; warnings only.
 */
export function evaluateAntiScamRules(
  input: EvaluateAntiScamInput,
): AntiScamWarning[] {
  const warnings: AntiScamWarning[] = [];
  const includeSticky = input.includeStickyHint !== false;

  if (!input.hasLinkedActiveOrder) {
    warnings.push({
      id: 'offer_not_linked',
      severity: 'block',
      title: 'Offer не привязан к заказу R.I.P',
      body: 'Нет активного заказа с этим offerId. Не принимайте — так часто подменяют сделку после оплаты на другой площадке или в чате.',
    });
  }

  const slots = input.slots;
  if (slots) {
    const viewerIsBuyer = input.role === 'buyer' || input.role === null;
    if (viewerIsBuyer && slots.yourItemCount > 0) {
      warnings.push({
        id: 'requests_your_items',
        severity: 'block',
        title: 'В оффере просят ваши предметы',
        body: 'Для покупки на R.I.P Market вы ничего не отдаёте — только принимаете скин. Запрос ваших предметов = риск скама.',
      });
    }

    if (slots.theirItemCount > 1) {
      warnings.push({
        id: 'extra_items_from_them',
        severity: 'warn',
        title: 'В оффере лишние предметы',
        body: 'Ожидается один скин по заказу. Несколько предметов в оффере — частый приём подмены (добавили дешёвое, убрали нужное).',
      });
    }

    if (slots.steamEscrowHint) {
      warnings.push({
        id: 'steam_trade_hold',
        severity: 'warn',
        title: 'Steam Trade Hold / escrow',
        body: `Steam удерживает обмен: «${slots.steamEscrowHint}». Учтите задержку доставки и не соглашайтесь на оплату «в обход» площадки.`,
      });
    }
  }

  if (includeSticky) {
    warnings.push(STICKY_HINT);
  }

  return warnings;
}

export function antiScamHasBlocking(warnings: AntiScamWarning[]): boolean {
  return warnings.some((warning) => warning.severity === 'block');
}

/** Short sticky line for list toolbar / floating strip. */
export function antiScamStickyLine(): string {
  return STICKY_HINT.title + '. ' + STICKY_HINT.body;
}

export function antiScamStickyShort(): string {
  return 'Не принимайте обмены из чата / профиля незнакомца — только сделки R.I.P.';
}
