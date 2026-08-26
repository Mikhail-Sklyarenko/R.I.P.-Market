/**
 * D9: Seller onboarding on Steam CS2 inventory —
 * one-shot coach mark + Trade URL / extension checklist.
 */
import {
  createExtensionT,
  DEFAULT_EXTENSION_LOCALE,
  type ExtensionLocale,
} from './extension-i18n.js';

export const INVENTORY_SELLER_ONBOARDING_KEY = 'rip:inventorySellerOnboarding';
export const COACH_AUTO_DISMISS_MS = 30_000;

export type InventorySellerOnboardingState = {
  coachDismissed: boolean;
  coachSeenAt: string | null;
};

export type SellerChecklistItemKey = 'extension' | 'trade_url';

export type SellerChecklistItem = {
  key: SellerChecklistItemKey;
  label: string;
  hint: string;
  ready: boolean;
  actionLabel: string | null;
  actionHref: string | null;
};

export type SellerChecklistView = {
  title: string;
  items: SellerChecklistItem[];
  allReady: boolean;
  readyCount: number;
  summaryLine: string;
};

export type CoachMarkView = {
  visible: boolean;
  title: string;
  body: string;
  dismissLabel: string;
  autoDismissMs: number;
};

export function defaultOnboardingState(): InventorySellerOnboardingState {
  return {
    coachDismissed: false,
    coachSeenAt: null,
  };
}

export function parseOnboardingState(
  raw: unknown,
): InventorySellerOnboardingState {
  if (!raw || typeof raw !== 'object') {
    return defaultOnboardingState();
  }
  const record = raw as Record<string, unknown>;
  return {
    coachDismissed: record.coachDismissed === true,
    coachSeenAt:
      typeof record.coachSeenAt === 'string' && record.coachSeenAt.trim()
        ? record.coachSeenAt
        : null,
  };
}

export function shouldShowCoachMark(
  state: InventorySellerOnboardingState,
): boolean {
  return !state.coachDismissed;
}

export function markCoachSeen(
  state: InventorySellerOnboardingState,
  nowIso = new Date().toISOString(),
): InventorySellerOnboardingState {
  return {
    ...state,
    coachSeenAt: state.coachSeenAt ?? nowIso,
  };
}

export function dismissCoachMark(
  state: InventorySellerOnboardingState,
  nowIso = new Date().toISOString(),
): InventorySellerOnboardingState {
  return {
    coachDismissed: true,
    coachSeenAt: state.coachSeenAt ?? nowIso,
  };
}

export function resolveCoachMarkView(params: {
  state: InventorySellerOnboardingState;
  locale?: ExtensionLocale;
}): CoachMarkView {
  const locale = params.locale ?? DEFAULT_EXTENSION_LOCALE;
  const t = createExtensionT(locale);
  return {
    visible: shouldShowCoachMark(params.state),
    title: t('onboarding.coachTitle'),
    body: t('onboarding.coachBody'),
    dismissLabel: t('onboarding.coachDismiss'),
    autoDismissMs: COACH_AUTO_DISMISS_MS,
  };
}

export function hasValidTradeUrl(tradeUrl?: string | null): boolean {
  const trimmed = tradeUrl?.trim() ?? '';
  if (trimmed.length < 10) {
    return false;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.hostname !== 'steamcommunity.com') {
      return false;
    }
    if (parsed.pathname !== '/tradeoffer/new/') {
      return false;
    }
    const partner = parsed.searchParams.get('partner');
    const token = parsed.searchParams.get('token');
    return Boolean(partner && /^\d+$/.test(partner) && token && token.length > 0);
  } catch {
    return false;
  }
}

export function resolveSellerChecklistView(params: {
  extensionConnected: boolean;
  tradeUrl: string | null | undefined;
  accountUrl: string;
  locale?: ExtensionLocale;
}): SellerChecklistView {
  const locale = params.locale ?? DEFAULT_EXTENSION_LOCALE;
  const t = createExtensionT(locale);
  const tradeUrlReady = hasValidTradeUrl(params.tradeUrl);
  const items: SellerChecklistItem[] = [
    {
      key: 'extension',
      label: t('onboarding.extensionReady'),
      hint: t('onboarding.extensionHint'),
      ready: params.extensionConnected,
      actionLabel: params.extensionConnected
        ? null
        : t('onboarding.extensionAction'),
      actionHref: params.extensionConnected ? null : params.accountUrl,
    },
    {
      key: 'trade_url',
      label: t('onboarding.tradeUrlTitle'),
      hint: t('onboarding.tradeUrlHint'),
      ready: tradeUrlReady,
      actionLabel: tradeUrlReady ? null : t('onboarding.tradeUrlAction'),
      actionHref: tradeUrlReady
        ? null
        : `${params.accountUrl}#account-trade-url-section`,
    },
  ];
  const readyCount = items.filter((item) => item.ready).length;
  const allReady = readyCount === items.length;
  return {
    title: t('onboarding.checklistTitle'),
    items,
    allReady,
    readyCount,
    summaryLine: allReady
      ? t('onboarding.checklistReady')
      : t('onboarding.checklistProgress', {
          ready: String(readyCount),
          total: String(items.length),
        }),
  };
}
