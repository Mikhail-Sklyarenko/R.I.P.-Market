/**
 * E4: Ops health for popup — last successful poll, Steam rate-limit, version.
 */
import {
  createExtensionT,
  DEFAULT_EXTENSION_LOCALE,
  type ExtensionLocale,
} from './extension-i18n.js';

export const OPS_HEALTH_STORAGE_KEY = 'rip:opsHealth';
export const EXTENSION_UPDATE_URL =
  'https://github.com/Mikhail-Sklyarenko/R.I.P.-Market/releases';

/** Warn when last successful poll older than this. */
export const POLL_STALE_WARN_MS = 90_000;
/** Error when last successful poll older than this. */
export const POLL_STALE_ERROR_MS = 5 * 60_000;
/** Treat rate-limit as still active within this window after last hit. */
export const RATE_LIMIT_ACTIVE_WINDOW_MS = 2 * 60_000;

export type OpsHealthTone = 'ok' | 'warn' | 'error' | 'muted';

export type OpsHealthPollState = {
  lastTaskPollOkAt: string | null;
  lastActiveTradesOkAt: string | null;
  lastPollErrorAt: string | null;
  lastPollErrorMessage: string | null;
  lastRateLimitedAt: string | null;
};

export type OpsHealthSnapshot = {
  poll: OpsHealthPollState;
  rateLimited: boolean;
  rateLimitCheckedAt: string | null;
  rateLimitMessage: string | null;
  extensionVersion: string;
  updateUrl: string;
  connected: boolean;
};

export type OpsHealthView = {
  pollLine: string;
  pollTone: OpsHealthTone;
  rateLimitLine: string;
  rateLimitTone: OpsHealthTone;
  versionLine: string;
  updateLabel: string;
  updateUrl: string;
};

export function defaultOpsHealthPollState(): OpsHealthPollState {
  return {
    lastTaskPollOkAt: null,
    lastActiveTradesOkAt: null,
    lastPollErrorAt: null,
    lastPollErrorMessage: null,
    lastRateLimitedAt: null,
  };
}

export function parseOpsHealthPollState(raw: unknown): OpsHealthPollState {
  if (!raw || typeof raw !== 'object') {
    return defaultOpsHealthPollState();
  }
  const record = raw as Record<string, unknown>;
  const asIso = (value: unknown): string | null =>
    typeof value === 'string' && value.trim() ? value : null;
  return {
    lastTaskPollOkAt: asIso(record.lastTaskPollOkAt),
    lastActiveTradesOkAt: asIso(record.lastActiveTradesOkAt),
    lastPollErrorAt: asIso(record.lastPollErrorAt),
    lastPollErrorMessage:
      typeof record.lastPollErrorMessage === 'string'
        ? record.lastPollErrorMessage
        : null,
    lastRateLimitedAt: asIso(record.lastRateLimitedAt),
  };
}

export function resolveLastSuccessfulPollAt(
  poll: OpsHealthPollState,
): string | null {
  const candidates = [poll.lastTaskPollOkAt, poll.lastActiveTradesOkAt]
    .map((iso) => (iso ? Date.parse(iso) : NaN))
    .filter((ms) => Number.isFinite(ms));
  if (candidates.length === 0) {
    return null;
  }
  return new Date(Math.max(...candidates)).toISOString();
}

export function formatRelativePollAge(
  iso: string | null,
  nowMs = Date.now(),
  locale: ExtensionLocale = DEFAULT_EXTENSION_LOCALE,
): string {
  const t = createExtensionT(locale);
  if (!iso) {
    return t('ops.never');
  }
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) {
    return t('ops.never');
  }
  const delta = Math.max(0, nowMs - then);
  if (delta < 15_000) {
    return t('ops.justNow');
  }
  if (delta < 60_000) {
    return t('ops.secondsAgo', { seconds: String(Math.floor(delta / 1000)) });
  }
  if (delta < 60 * 60_000) {
    return t('ops.minutesAgo', {
      minutes: String(Math.floor(delta / 60_000)),
    });
  }
  const hours = Math.floor(delta / (60 * 60_000));
  return t('ops.hoursAgo', { hours: String(hours) });
}

export function resolvePollTone(params: {
  lastSuccessfulPollAt: string | null;
  connected: boolean;
  nowMs?: number;
}): OpsHealthTone {
  if (!params.connected) {
    return 'muted';
  }
  if (!params.lastSuccessfulPollAt) {
    return 'warn';
  }
  const then = Date.parse(params.lastSuccessfulPollAt);
  if (!Number.isFinite(then)) {
    return 'warn';
  }
  const age = (params.nowMs ?? Date.now()) - then;
  if (age >= POLL_STALE_ERROR_MS) {
    return 'error';
  }
  if (age >= POLL_STALE_WARN_MS) {
    return 'warn';
  }
  return 'ok';
}

export function isRateLimitActive(params: {
  healthRateLimited?: boolean;
  lastRateLimitedAt: string | null;
  nowMs?: number;
}): boolean {
  if (params.healthRateLimited) {
    return true;
  }
  if (!params.lastRateLimitedAt) {
    return false;
  }
  const then = Date.parse(params.lastRateLimitedAt);
  if (!Number.isFinite(then)) {
    return false;
  }
  return (params.nowMs ?? Date.now()) - then < RATE_LIMIT_ACTIVE_WINDOW_MS;
}

export function buildOpsHealthView(params: {
  snapshot: OpsHealthSnapshot;
  nowMs?: number;
  locale?: ExtensionLocale;
}): OpsHealthView {
  const locale = params.locale ?? DEFAULT_EXTENSION_LOCALE;
  const t = createExtensionT(locale);
  const nowMs = params.nowMs ?? Date.now();
  const lastOk = resolveLastSuccessfulPollAt(params.snapshot.poll);
  const pollTone = resolvePollTone({
    lastSuccessfulPollAt: lastOk,
    connected: params.snapshot.connected,
    nowMs,
  });
  const age = formatRelativePollAge(lastOk, nowMs, locale);
  const pollLine =
    pollTone === 'error'
      ? t('ops.pollStale', { age })
      : pollTone === 'warn' && !lastOk
        ? t('ops.pollNever')
        : pollTone === 'warn'
          ? t('ops.pollOld', { age })
          : t('ops.pollOk', { age });

  const rateActive = params.snapshot.rateLimited;
  const rateLimitTone: OpsHealthTone = !params.snapshot.connected
    ? 'muted'
    : rateActive
      ? 'warn'
      : 'ok';
  const rateLimitLine = rateActive
    ? params.snapshot.rateLimitMessage?.trim() || t('ops.rateLimited')
    : t('ops.rateOk');

  return {
    pollLine,
    pollTone,
    rateLimitLine,
    rateLimitTone,
    versionLine: t('ops.version', {
      version: params.snapshot.extensionVersion,
    }),
    updateLabel: t('ops.updateExtension'),
    updateUrl: params.snapshot.updateUrl || EXTENSION_UPDATE_URL,
  };
}

export function markTaskPollOk(
  state: OpsHealthPollState,
  atIso = new Date().toISOString(),
): OpsHealthPollState {
  return {
    ...state,
    lastTaskPollOkAt: atIso,
    lastPollErrorAt: null,
    lastPollErrorMessage: null,
  };
}

export function markActiveTradesPollOk(
  state: OpsHealthPollState,
  atIso = new Date().toISOString(),
): OpsHealthPollState {
  return {
    ...state,
    lastActiveTradesOkAt: atIso,
    lastPollErrorAt: null,
    lastPollErrorMessage: null,
  };
}

export function markPollError(
  state: OpsHealthPollState,
  message: string,
  atIso = new Date().toISOString(),
): OpsHealthPollState {
  return {
    ...state,
    lastPollErrorAt: atIso,
    lastPollErrorMessage: message.slice(0, 200),
  };
}

export function markRateLimited(
  state: OpsHealthPollState,
  atIso = new Date().toISOString(),
): OpsHealthPollState {
  return {
    ...state,
    lastRateLimitedAt: atIso,
  };
}
