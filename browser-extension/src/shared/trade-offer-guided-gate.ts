import type {
  ActiveTradeItem,
  TradeVerificationResult,
  TradeVerificationStatus,
} from '@rip-market/extension-orchestrator';
import {
  createExtensionT,
  DEFAULT_EXTENSION_LOCALE,
  type ExtensionLocale,
} from './extension-i18n.js';

export type ObservedOfferSnapshot = {
  assetId?: string | null;
  marketHashName?: string | null;
  floatValue?: string | null;
  /** SteamID64 of the trade partner as seen on the Steam page / URL. */
  partnerSteamId?: string | null;
  wear?: string | null;
};

export type CompareRow = {
  key: string;
  label: string;
  expected: string;
  observed: string;
  tone: 'ok' | 'warn' | 'error' | 'neutral';
};

export type GuidedGateHeadline = {
  title: string;
  subtitle: string;
  tone: 'ok' | 'warn' | 'error' | 'pending';
};

export function guidedGateHeadline(
  status: TradeVerificationStatus,
  role: TradeVerificationResult['role'],
  locale: ExtensionLocale = DEFAULT_EXTENSION_LOCALE,
): GuidedGateHeadline {
  const t = createExtensionT(locale);
  if (status === 'mismatch') {
    return {
      title: t('guided.mismatchTitle'),
      subtitle:
        role === 'buyer'
          ? t('guided.mismatchBuyer')
          : t('guided.mismatchSeller'),
      tone: 'error',
    };
  }
  if (status === 'verified') {
    return {
      title: t('guided.verifiedTitle'),
      subtitle:
        role === 'buyer'
          ? t('guided.verifiedBuyer')
          : t('guided.verifiedSeller'),
      tone: 'ok',
    };
  }
  if (status === 'partial') {
    return {
      title: t('guided.partialTitle'),
      subtitle: t('guided.partialBody'),
      tone: 'warn',
    };
  }
  return {
    title: t('guided.pendingTitle'),
    subtitle: t('guided.pendingBody'),
    tone: 'pending',
  };
}

function normalize(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? '';
  return trimmed || '—';
}

function compareTone(
  expected: string,
  observed: string,
  opts?: { softWhenMissingObserved?: boolean },
): CompareRow['tone'] {
  if (expected === '—' && observed === '—') {
    return 'neutral';
  }
  if (observed === '—') {
    return opts?.softWhenMissingObserved ? 'warn' : 'warn';
  }
  if (expected === '—') {
    return 'warn';
  }
  return expected === observed ? 'ok' : 'error';
}

export function buildGuidedCompareRows(
  expected: ActiveTradeItem,
  observed: ObservedOfferSnapshot | null | undefined,
  locale: ExtensionLocale = DEFAULT_EXTENSION_LOCALE,
  partner?: {
    expectedPartnerSteamId?: string | null;
    observedPartnerSteamId?: string | null;
  },
): CompareRow[] {
  const t = createExtensionT(locale);
  const expectedName = normalize(expected.marketHashName);
  const observedName = normalize(observed?.marketHashName);
  const expectedAsset = normalize(expected.assetExternalId);
  const observedAsset = normalize(observed?.assetId);
  const expectedFloat = normalize(expected.floatValue);
  const observedFloat = normalize(observed?.floatValue);
  const expectedWear = normalize(expected.wear);
  const observedWear = normalize(observed?.wear);
  const expectedPartner = normalize(
    partner?.expectedPartnerSteamId ?? null,
  );
  const observedPartner = normalize(
    partner?.observedPartnerSteamId ?? observed?.partnerSteamId,
  );

  const rows: CompareRow[] = [
    {
      key: 'partner',
      label: t('guided.partner'),
      expected: expectedPartner,
      observed: observedPartner,
      tone: compareTone(expectedPartner, observedPartner, {
        softWhenMissingObserved: true,
      }),
    },
    {
      key: 'name',
      label: t('guided.name'),
      expected: expectedName,
      observed: observedName,
      tone: compareTone(expectedName, observedName, {
        softWhenMissingObserved: true,
      }),
    },
    {
      key: 'asset',
      label: t('guided.assetId'),
      expected: expectedAsset,
      observed: observedAsset,
      tone: compareTone(expectedAsset, observedAsset, {
        softWhenMissingObserved: true,
      }),
    },
  ];

  if (expectedWear !== '—' || observedWear !== '—') {
    rows.push({
      key: 'wear',
      label: t('guided.wear'),
      expected: expectedWear,
      observed: observedWear,
      tone: compareTone(expectedWear, observedWear, {
        softWhenMissingObserved: true,
      }),
    });
  }

  if (expectedFloat !== '—' || observedFloat !== '—') {
    rows.push({
      key: 'float',
      label: t('guided.float'),
      expected: expectedFloat,
      observed: observedFloat,
      tone: compareTone(expectedFloat, observedFloat, {
        softWhenMissingObserved: true,
      }),
    });
  }

  if (expected.stickers && expected.stickers.length > 0) {
    rows.push({
      key: 'stickers',
      label: t('guided.stickers'),
      expected: expected.stickers
        .map((sticker) =>
          sticker.wearPercent != null
            ? `${sticker.name} (${sticker.wearPercent}%)`
            : sticker.name,
        )
        .join(', '),
      observed: '—',
      tone: 'neutral',
    });
  }

  return rows;
}

export function buildSupportIssueUrl(siteUrl: string, orderId: string): string {
  try {
    const url = new URL(siteUrl);
    url.pathname = '/support';
    url.search = `?dealId=${encodeURIComponent(orderId)}&topic=deal&reason=trade_problem`;
    return url.toString();
  } catch {
    return siteUrl;
  }
}

/**
 * Buyer CTA on the offer page: urge Accept only when verified.
 * Never auto-clicks Steam Accept.
 */
export function buyerOfferPagePrimaryHint(
  status: TradeVerificationStatus,
  locale: ExtensionLocale = DEFAULT_EXTENSION_LOCALE,
): { kind: 'accept_steam' | 'wait' | 'block'; text: string } {
  const t = createExtensionT(locale);
  if (status === 'mismatch') {
    return {
      kind: 'block',
      text: t('guided.hintBlock'),
    };
  }
  if (status === 'verified') {
    return {
      kind: 'accept_steam',
      text: t('guided.hintAccept'),
    };
  }
  return {
    kind: 'wait',
    text: t('guided.hintWait'),
  };
}
