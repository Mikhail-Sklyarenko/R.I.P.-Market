/**
 * H4: Offline / partial site link — show cached deals, block list/send.
 * Live = site polls healthy. Degraded = flaky/stale. Offline = unreachable.
 */
import {
  POLL_STALE_ERROR_MS,
  POLL_STALE_WARN_MS,
} from './extension-ops-health.js';
import {
  createExtensionT,
  DEFAULT_EXTENSION_LOCALE,
  type ExtensionLocale,
} from './extension-i18n.js';
import type {
  NextActionCta,
  NextActionCtaId,
  ResolvedNextAction,
} from './popup-next-action.js';

export const SITE_LINK_STORAGE_KEY = 'rip:siteLink';

export type SiteLinkMode = 'live' | 'degraded' | 'offline';

export type SiteLinkSnapshot = {
  mode: SiteLinkMode;
  /** True when mode is not live — mutations that need the site are blocked. */
  safeMode: boolean;
  fromCache: boolean;
  cacheUpdatedAt: string | null;
  lastError: string | null;
  checkedAt: string;
};

export type SafeModeBannerView = {
  tone: 'warn' | 'error';
  title: string;
  body: string;
  cacheLine: string | null;
};

export type SafeModeBlockedMutation =
  | 'list'
  | 'send'
  | 'ack'
  | 'update_lot'
  | 'cancel_lot';

const NETWORKISH_RE =
  /failed to fetch|networkerror|net::|err_connection|err_name_not_resolved|err_internet|econnrefused|econnreset|enotfound|timed?\s*out|network request failed|load failed|abort/i;

export function isNetworkishError(message: string | null | undefined): boolean {
  if (!message?.trim()) {
    return false;
  }
  return NETWORKISH_RE.test(message);
}

export function defaultSiteLinkSnapshot(
  nowMs = Date.now(),
): SiteLinkSnapshot {
  return {
    mode: 'offline',
    safeMode: true,
    fromCache: false,
    cacheUpdatedAt: null,
    lastError: null,
    checkedAt: new Date(nowMs).toISOString(),
  };
}

/**
 * Resolve connectivity mode from poll telemetry + optional live fetch result.
 * `liveFetchOk: true` always wins (just recovered). `false` forces degraded/offline.
 */
export function resolveSiteLinkMode(params: {
  paired: boolean;
  lastSuccessfulPollAt: string | null;
  lastPollErrorAt: string | null;
  lastPollErrorMessage: string | null;
  /** Explicit outcome of the latest site fetch, if any. */
  liveFetchOk?: boolean | null;
  nowMs?: number;
}): SiteLinkMode {
  const nowMs = params.nowMs ?? Date.now();

  if (!params.paired) {
    return 'offline';
  }

  if (params.liveFetchOk === true) {
    return 'live';
  }

  const lastOkMs = params.lastSuccessfulPollAt
    ? Date.parse(params.lastSuccessfulPollAt)
    : NaN;
  const lastErrMs = params.lastPollErrorAt
    ? Date.parse(params.lastPollErrorAt)
    : NaN;
  const hasOk = Number.isFinite(lastOkMs);
  const hasErr = Number.isFinite(lastErrMs);
  const okAge = hasOk ? nowMs - lastOkMs : Number.POSITIVE_INFINITY;
  const errorIsNewer = hasErr && (!hasOk || lastErrMs > lastOkMs);
  const networkish = isNetworkishError(params.lastPollErrorMessage);

  if (params.liveFetchOk === false) {
    if (hasOk && okAge < POLL_STALE_WARN_MS && !networkish) {
      return 'degraded';
    }
    if (hasOk && okAge < POLL_STALE_ERROR_MS) {
      return 'degraded';
    }
    return 'offline';
  }

  // No explicit live result — infer from telemetry.
  if (errorIsNewer) {
    if (networkish || !hasOk || okAge >= POLL_STALE_ERROR_MS) {
      return 'offline';
    }
    return 'degraded';
  }

  if (!hasOk) {
    return 'offline';
  }
  if (okAge >= POLL_STALE_ERROR_MS) {
    return 'offline';
  }
  if (okAge >= POLL_STALE_WARN_MS) {
    return 'degraded';
  }
  return 'live';
}

export function buildSiteLinkSnapshot(params: {
  mode: SiteLinkMode;
  fromCache?: boolean;
  cacheUpdatedAt?: string | null;
  lastError?: string | null;
  nowMs?: number;
}): SiteLinkSnapshot {
  const nowMs = params.nowMs ?? Date.now();
  return {
    mode: params.mode,
    safeMode: params.mode !== 'live',
    fromCache: Boolean(params.fromCache),
    cacheUpdatedAt: params.cacheUpdatedAt ?? null,
    lastError: params.lastError ?? null,
    checkedAt: new Date(nowMs).toISOString(),
  };
}

export function isSafeModeMutationBlocked(
  safeMode: boolean,
  _mutation: SafeModeBlockedMutation,
): boolean {
  return safeMode;
}

const SITE_MUTATION_CTA_IDS = new Set<NextActionCtaId>([
  'retry_send',
  'open_trade_url',
  'confirm_sent_ack',
  'confirm_received_ack',
  'pre_accept_ack',
]);

export function isSiteMutationCta(id: NextActionCtaId): boolean {
  return SITE_MUTATION_CTA_IDS.has(id);
}

function waitSafeModeCta(locale: ExtensionLocale): NextActionCta {
  const t = createExtensionT(locale);
  return {
    id: 'wait_seller',
    label: t('safeMode.waitCta'),
    mode: 'runtime',
    runtime: 'poll_now',
  };
}

/**
 * Keep warning / Steam-local CTAs; replace list/send/ack primaries with calm wait.
 */
export function applySafeModeToNextAction(
  resolved: ResolvedNextAction,
  safeMode: boolean,
  locale: ExtensionLocale = DEFAULT_EXTENSION_LOCALE,
): ResolvedNextAction {
  if (!safeMode) {
    return resolved;
  }
  const t = createExtensionT(locale);
  const overflow = resolved.overflow.filter(
    (cta) => !isSiteMutationCta(cta.id),
  );
  if (!isSiteMutationCta(resolved.primary.id)) {
    return {
      ...resolved,
      overflow,
      hint: resolved.hint ?? t('safeMode.hint'),
    };
  }
  return {
    primary: waitSafeModeCta(locale),
    overflow,
    hint: t('safeMode.hint'),
  };
}

export function buildSafeModeBanner(
  snapshot: SiteLinkSnapshot,
  locale: ExtensionLocale = DEFAULT_EXTENSION_LOCALE,
): SafeModeBannerView | null {
  if (!snapshot.safeMode) {
    return null;
  }
  const t = createExtensionT(locale);
  const tone = snapshot.mode === 'offline' ? 'error' : 'warn';
  const title =
    snapshot.mode === 'offline'
      ? t('safeMode.offlineTitle')
      : t('safeMode.degradedTitle');
  const body =
    snapshot.mode === 'offline'
      ? t('safeMode.offlineBody')
      : t('safeMode.degradedBody');
  let cacheLine: string | null = null;
  if (snapshot.cacheUpdatedAt) {
    try {
      const when = new Date(snapshot.cacheUpdatedAt).toLocaleString(
        locale === 'en' ? 'en-US' : 'ru-RU',
      );
      cacheLine = t('safeMode.cacheLine', { when });
    } catch {
      cacheLine = t('safeMode.cacheLine', { when: snapshot.cacheUpdatedAt });
    }
  } else if (snapshot.fromCache) {
    cacheLine = t('safeMode.cacheEmpty');
  }
  return { tone, title, body, cacheLine };
}

export function safeModeBannerHtml(view: SafeModeBannerView): string {
  const cache = view.cacheLine
    ? `<p class="safe-mode-cache">${escapeHtml(view.cacheLine)}</p>`
    : '';
  return `
    <p class="safe-mode-title">${escapeHtml(view.title)}</p>
    <p class="safe-mode-body">${escapeHtml(view.body)}</p>
    ${cache}
  `;
}

export function safeModeBlockMessage(
  locale: ExtensionLocale = DEFAULT_EXTENSION_LOCALE,
): string {
  return createExtensionT(locale)('safeMode.blockMessage');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function getStoredSiteLinkSnapshot(): Promise<SiteLinkSnapshot> {
  const stored = await chrome.storage.local.get(SITE_LINK_STORAGE_KEY);
  const raw = stored[SITE_LINK_STORAGE_KEY];
  if (!raw || typeof raw !== 'object') {
    return defaultSiteLinkSnapshot();
  }
  const record = raw as Partial<SiteLinkSnapshot>;
  const mode =
    record.mode === 'live' ||
    record.mode === 'degraded' ||
    record.mode === 'offline'
      ? record.mode
      : 'offline';
  return {
    mode,
    safeMode: mode !== 'live',
    fromCache: Boolean(record.fromCache),
    cacheUpdatedAt:
      typeof record.cacheUpdatedAt === 'string' ? record.cacheUpdatedAt : null,
    lastError: typeof record.lastError === 'string' ? record.lastError : null,
    checkedAt:
      typeof record.checkedAt === 'string'
        ? record.checkedAt
        : new Date().toISOString(),
  };
}

export async function setStoredSiteLinkSnapshot(
  snapshot: SiteLinkSnapshot,
): Promise<void> {
  await chrome.storage.local.set({ [SITE_LINK_STORAGE_KEY]: snapshot });
}

/** Build + persist site link from poll telemetry (service worker). */
export async function persistSiteLinkFromPoll(params: {
  paired: boolean;
  lastSuccessfulPollAt: string | null;
  lastPollErrorAt: string | null;
  lastPollErrorMessage: string | null;
  liveFetchOk?: boolean | null;
  fromCache?: boolean;
  cacheUpdatedAt?: string | null;
  lastError?: string | null;
  nowMs?: number;
}): Promise<SiteLinkSnapshot> {
  const mode = resolveSiteLinkMode({
    paired: params.paired,
    lastSuccessfulPollAt: params.lastSuccessfulPollAt,
    lastPollErrorAt: params.lastPollErrorAt,
    lastPollErrorMessage: params.lastPollErrorMessage,
    liveFetchOk: params.liveFetchOk,
    nowMs: params.nowMs,
  });
  const snapshot = buildSiteLinkSnapshot({
    mode,
    fromCache: params.fromCache,
    cacheUpdatedAt: params.cacheUpdatedAt,
    lastError: params.lastError ?? params.lastPollErrorMessage,
    nowMs: params.nowMs,
  });
  await setStoredSiteLinkSnapshot(snapshot);
  return snapshot;
}
