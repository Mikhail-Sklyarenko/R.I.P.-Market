/**
 * Deal Shield — unified view-model for active-trade trust surfaces (1a–1e).
 * Steam offer panel, tradeoffers detail, popup cards, seller pre-send.
 */
import type {
  ActiveTradeItem,
  TradeVerificationCheck,
  TradeVerificationResult,
  TradeVerificationStatus,
} from '@rip-market/extension-orchestrator';
import {
  createExtensionT,
  DEFAULT_EXTENSION_LOCALE,
  type ExtensionLocale,
} from './extension-i18n.js';
import {
  buildGuidedCompareRows,
  guidedGateHeadline,
  type CompareRow,
  type GuidedGateHeadline,
  type ObservedOfferSnapshot,
} from './trade-offer-guided-gate.js';
import { buildSteamProfileUrl, isRealSteamId64 } from './steam-id64.js';
import { formatMoneyMinor } from './trade-offers-list-marking.js';

export type DealShieldPartnerMatch =
  | 'match'
  | 'mismatch'
  | 'missing_expected'
  | 'missing_observed'
  | 'unknown';

export type DealShieldItemLine = {
  key: string;
  label: string;
  value: string;
};

export type DealShieldModel = {
  orderId: string;
  orderShortId: string;
  amountLabel: string;
  role: 'buyer' | 'seller';
  /** Viewer-facing label of the counterparty role. */
  counterpartyRoleLabel: string;
  headline: GuidedGateHeadline;
  effectiveStatus: TradeVerificationStatus;
  partner: {
    displayName: string;
    steamId: string | null;
    avatarUrl: string | null;
    profileUrl: string | null;
    match: DealShieldPartnerMatch;
    matchLabel: string;
  };
  item: {
    marketHashName: string;
    iconUrl: string | null;
    lines: DealShieldItemLine[];
    assetExternalId: string;
  };
  compareRows: CompareRow[];
  checks: TradeVerificationCheck[];
  /** True when Accept assist / Accept hints must stay blocked. */
  blocksAccept: boolean;
  /** Seller on /tradeoffer/new — emphasize send checklist. */
  isPreSend: boolean;
  siteUrl: string;
  offerId: string | null;
};

export type ObservedOfferSnapshotExtended = ObservedOfferSnapshot & {
  partnerSteamId?: string | null;
  wear?: string | null;
};

function normalizeId(value: string | null | undefined): string {
  return value?.trim() ?? '';
}

export function resolvePartnerMatch(params: {
  expectedSteamId: string | null | undefined;
  observedSteamId: string | null | undefined;
}): DealShieldPartnerMatch {
  const expected = normalizeId(params.expectedSteamId);
  const observed = normalizeId(params.observedSteamId);
  if (!expected || !isRealSteamId64(expected)) {
    return 'missing_expected';
  }
  if (!observed) {
    return 'missing_observed';
  }
  if (!isRealSteamId64(observed)) {
    return 'unknown';
  }
  return expected === observed ? 'match' : 'mismatch';
}

/**
 * Elevate verification when Steam partner SteamID disagrees with the order.
 * Missing observed → at most `partial` (never fake verified).
 */
export function applyPartnerObservation(
  trade: TradeVerificationResult,
  observedPartnerSteamId: string | null | undefined,
  locale: ExtensionLocale = DEFAULT_EXTENSION_LOCALE,
): TradeVerificationResult {
  const t = createExtensionT(locale);
  const match = resolvePartnerMatch({
    expectedSteamId: trade.counterparty.steamId,
    observedSteamId: observedPartnerSteamId,
  });

  const withoutPartnerChecks = trade.checks.filter(
    (check) => check.key !== 'partner_steam_match',
  );

  if (match === 'mismatch') {
    return {
      ...trade,
      verificationStatus: 'mismatch',
      checks: [
        ...withoutPartnerChecks,
        {
          key: 'partner_steam_match',
          passed: false,
          label: t('shield.partnerMismatchCheck'),
          severity: 'error',
        },
      ],
    };
  }

  if (match === 'match') {
    return {
      ...trade,
      checks: [
        ...withoutPartnerChecks,
        {
          key: 'partner_steam_match',
          passed: true,
          label: t('shield.partnerMatchCheck'),
          severity: 'ok',
        },
      ],
    };
  }

  if (match === 'missing_observed' && trade.verificationStatus === 'verified') {
    return {
      ...trade,
      verificationStatus: 'partial',
      checks: [
        ...withoutPartnerChecks,
        {
          key: 'partner_steam_match',
          passed: false,
          label: t('shield.partnerMissingObservedCheck'),
          severity: 'warn',
        },
      ],
    };
  }

  if (match === 'missing_expected') {
    return {
      ...trade,
      verificationStatus:
        trade.verificationStatus === 'verified'
          ? 'partial'
          : trade.verificationStatus,
      checks: [
        ...withoutPartnerChecks,
        {
          key: 'partner_steam_match',
          passed: false,
          label: t('shield.partnerMissingExpectedCheck'),
          severity: 'warn',
        },
      ],
    };
  }

  return trade;
}

export function buildItemCharacteristicLines(
  item: ActiveTradeItem,
  locale: ExtensionLocale = DEFAULT_EXTENSION_LOCALE,
): DealShieldItemLine[] {
  const t = createExtensionT(locale);
  const lines: DealShieldItemLine[] = [];
  const wear = item.wear?.trim();
  if (wear) {
    lines.push({ key: 'wear', label: t('shield.wear'), value: wear });
  }
  const floatValue = item.floatValue?.trim();
  if (floatValue) {
    lines.push({ key: 'float', label: t('shield.float'), value: floatValue });
  }
  const stickers = item.stickers?.filter((s) => s.name?.trim()) ?? [];
  if (stickers.length > 0) {
    lines.push({
      key: 'stickers',
      label: t('shield.stickers'),
      value: stickers
        .map((s) =>
          s.wearPercent != null ? `${s.name} (${s.wearPercent}%)` : s.name,
        )
        .join(', '),
    });
  }
  return lines;
}

function partnerMatchLabel(
  match: DealShieldPartnerMatch,
  locale: ExtensionLocale,
): string {
  const t = createExtensionT(locale);
  switch (match) {
    case 'match':
      return t('shield.partnerMatch');
    case 'mismatch':
      return t('shield.partnerMismatch');
    case 'missing_observed':
      return t('shield.partnerMissingObserved');
    case 'missing_expected':
      return t('shield.partnerMissingExpected');
    default:
      return t('shield.partnerUnknown');
  }
}

export function buildDealShieldModel(params: {
  trade: TradeVerificationResult;
  observed?: ObservedOfferSnapshotExtended | null;
  locale?: ExtensionLocale;
  /** Explicit pre-send mode (seller drafting on /tradeoffer/new). */
  isPreSend?: boolean;
}): DealShieldModel {
  const locale = params.locale ?? DEFAULT_EXTENSION_LOCALE;
  const t = createExtensionT(locale);
  const observedPartner = params.observed?.partnerSteamId ?? null;
  const trade = applyPartnerObservation(
    params.trade,
    observedPartner,
    locale,
  );
  const match = resolvePartnerMatch({
    expectedSteamId: trade.counterparty.steamId,
    observedSteamId: observedPartner,
  });
  const steamId = trade.counterparty.steamId?.trim() || null;
  const displayName =
    trade.counterparty.personaName?.trim() ||
    trade.counterparty.username.trim() ||
    t('shield.unknownPartner');
  const isPreSend =
    params.isPreSend === true ||
    (trade.role === 'seller' && !trade.offerId);

  const compareRows = buildGuidedCompareRows(
    trade.item,
    params.observed ?? null,
    locale,
    {
      expectedPartnerSteamId: steamId,
      observedPartnerSteamId: observedPartner,
    },
  );

  return {
    orderId: trade.orderId,
    orderShortId: trade.orderShortId,
    amountLabel: formatMoneyMinor(trade.amountMinor),
    role: trade.role,
    counterpartyRoleLabel:
      trade.role === 'buyer' ? t('common.seller') : t('common.buyer'),
    headline: guidedGateHeadline(trade.verificationStatus, trade.role, locale),
    effectiveStatus: trade.verificationStatus,
    partner: {
      displayName,
      steamId,
      avatarUrl: trade.counterparty.avatarUrl?.trim() || null,
      profileUrl:
        steamId && isRealSteamId64(steamId)
          ? buildSteamProfileUrl(steamId)
          : null,
      match,
      matchLabel: partnerMatchLabel(match, locale),
    },
    item: {
      marketHashName: trade.item.marketHashName,
      iconUrl: trade.item.iconUrl,
      lines: buildItemCharacteristicLines(trade.item, locale),
      assetExternalId: trade.item.assetExternalId,
    },
    compareRows,
    checks: trade.checks,
    blocksAccept:
      trade.verificationStatus === 'mismatch' || match === 'mismatch',
    isPreSend,
    siteUrl: trade.siteUrl,
    offerId: trade.offerId,
  };
}

/** Compact one-line summary for popup / F3 strip enrichment. */
export function dealShieldPartnerSummary(model: DealShieldModel): string {
  const id = model.partner.steamId
    ? ` · ${model.partner.steamId.slice(-6)}`
    : '';
  return `${model.counterpartyRoleLabel}: ${model.partner.displayName}${id}`;
}
