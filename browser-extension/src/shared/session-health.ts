import { OfferErrorCode, type OfferErrorCodeType } from '@rip-market/extension-orchestrator';
import {
  createExtensionT,
  DEFAULT_EXTENSION_LOCALE,
  type ExtensionLocale,
} from './extension-i18n.js';
import { getSessionState } from './storage.js';
import { hasSteamBrowserSession, resolveLoggedInSteamId } from './steam-session.js';
import { loadCs2InventoryFromCookies } from './steam-cookie-client.js';

export const SESSION_DIAG_STORAGE_KEY = 'rip:last-session-diag';

export type SessionHealthCode =
  | 'OK'
  | 'EXT_DISCONNECTED'
  | 'SESSION_REVOKED'
  | 'STEAM_COOKIE_EXPIRED'
  | 'STEAM_ACCOUNT_MISMATCH'
  | 'INVENTORY_PRIVATE'
  | 'INVENTORY_RATE_LIMITED'
  | 'INVENTORY_NOT_LOADED';

export type SessionHealth = {
  code: SessionHealthCode;
  title: string;
  message: string;
  ctaLabel: string | null;
  ctaUrl: string | null;
  supportCode: string;
  sessionSteamId: string | null;
  expectedSteamId: string | null;
  checkedAt: string;
};

export type StoredSessionDiag = {
  code: SessionHealthCode;
  supportCode: string;
  message: string;
  savedAt: string;
};

const STEAM_LOGIN_URL = 'https://steamcommunity.com/login/home/';
const STEAM_PRIVACY_URL =
  'https://steamcommunity.com/my/edit/settings';
const STEAM_INVENTORY_URL = 'https://steamcommunity.com/my/inventory/#730_2';

function siteAccountUrl(apiBaseUrl?: string | null): string {
  const base = apiBaseUrl?.replace(/\/api\/v1\/?$/, '') ?? 'https://p2pcs.ru';
  return `${base}/account`;
}

export function buildSessionHealth(params: {
  code: SessionHealthCode;
  sessionSteamId?: string | null;
  expectedSteamId?: string | null;
  apiBaseUrl?: string | null;
  messageOverride?: string;
  locale?: ExtensionLocale;
}): SessionHealth {
  const sessionSteamId = params.sessionSteamId ?? null;
  const expectedSteamId = params.expectedSteamId ?? null;
  const checkedAt = new Date().toISOString();
  const locale = params.locale ?? DEFAULT_EXTENSION_LOCALE;
  const t = createExtensionT(locale);

  switch (params.code) {
    case 'OK':
      return {
        code: 'OK',
        title: t('session.okTitle'),
        message: params.messageOverride ?? t('session.okMessage'),
        ctaLabel: null,
        ctaUrl: null,
        supportCode: 'OK',
        sessionSteamId,
        expectedSteamId,
        checkedAt,
      };
    case 'EXT_DISCONNECTED':
      return {
        code: 'EXT_DISCONNECTED',
        title: t('session.disconnectedTitle'),
        message:
          params.messageOverride ?? t('session.disconnectedMessage'),
        ctaLabel: t('session.disconnectedCta'),
        ctaUrl: siteAccountUrl(params.apiBaseUrl),
        supportCode: 'EXT_DISCONNECTED',
        sessionSteamId,
        expectedSteamId,
        checkedAt,
      };
    case 'SESSION_REVOKED':
      return {
        code: 'SESSION_REVOKED',
        title: t('session.revokedTitle'),
        message: params.messageOverride ?? t('session.revokedMessage'),
        ctaLabel: t('session.revokedCta'),
        ctaUrl: siteAccountUrl(params.apiBaseUrl),
        supportCode: OfferErrorCode.SESSION_REVOKED,
        sessionSteamId,
        expectedSteamId,
        checkedAt,
      };
    case 'STEAM_COOKIE_EXPIRED':
      return {
        code: 'STEAM_COOKIE_EXPIRED',
        title: t('session.cookieTitle'),
        message: params.messageOverride ?? t('session.cookieMessage'),
        ctaLabel: t('session.cookieCta'),
        ctaUrl: STEAM_LOGIN_URL,
        supportCode: OfferErrorCode.STEAM_COOKIE_EXPIRED,
        sessionSteamId,
        expectedSteamId,
        checkedAt,
      };
    case 'STEAM_ACCOUNT_MISMATCH':
      return {
        code: 'STEAM_ACCOUNT_MISMATCH',
        title: t('session.mismatchTitle'),
        message:
          params.messageOverride ??
          t('session.mismatchMessage', {
            session: sessionSteamId ?? '—',
            expected: expectedSteamId ?? '—',
          }),
        ctaLabel: t('session.mismatchCta'),
        ctaUrl: STEAM_LOGIN_URL,
        supportCode: OfferErrorCode.STEAM_ACCOUNT_MISMATCH,
        sessionSteamId,
        expectedSteamId,
        checkedAt,
      };
    case 'INVENTORY_PRIVATE':
      return {
        code: 'INVENTORY_PRIVATE',
        title: t('session.privateTitle'),
        message: params.messageOverride ?? t('session.privateMessage'),
        ctaLabel: t('session.privateCta'),
        ctaUrl: STEAM_PRIVACY_URL,
        supportCode: OfferErrorCode.INVENTORY_PRIVATE,
        sessionSteamId,
        expectedSteamId,
        checkedAt,
      };
    case 'INVENTORY_RATE_LIMITED':
      return {
        code: 'INVENTORY_RATE_LIMITED',
        title: t('session.rateTitle'),
        message: params.messageOverride ?? t('session.rateMessage'),
        ctaLabel: t('session.rateCta'),
        ctaUrl: STEAM_INVENTORY_URL,
        supportCode: OfferErrorCode.INVENTORY_RATE_LIMITED,
        sessionSteamId,
        expectedSteamId,
        checkedAt,
      };
    case 'INVENTORY_NOT_LOADED':
    default:
      return {
        code: 'INVENTORY_NOT_LOADED',
        title: t('session.inventoryTitle'),
        message: params.messageOverride ?? t('session.inventoryMessage'),
        ctaLabel: t('session.inventoryCta'),
        ctaUrl: STEAM_INVENTORY_URL,
        supportCode: OfferErrorCode.INVENTORY_NOT_LOADED,
        sessionSteamId,
        expectedSteamId,
        checkedAt,
      };
  }
}

export async function saveLastSessionDiag(
  diag: Pick<SessionHealth, 'code' | 'supportCode' | 'message'>,
): Promise<void> {
  const entry: StoredSessionDiag = {
    code: diag.code,
    supportCode: diag.supportCode,
    message: diag.message,
    savedAt: new Date().toISOString(),
  };
  await chrome.storage.local.set({ [SESSION_DIAG_STORAGE_KEY]: entry });
}

export async function getLastSessionDiag(): Promise<StoredSessionDiag | null> {
  const stored = await chrome.storage.local.get(SESSION_DIAG_STORAGE_KEY);
  const entry = stored[SESSION_DIAG_STORAGE_KEY] as StoredSessionDiag | undefined;
  return entry?.code ? entry : null;
}

export async function clearLastSessionDiag(): Promise<void> {
  await chrome.storage.local.remove(SESSION_DIAG_STORAGE_KEY);
}

export function offerErrorToSessionHealthCode(
  code: string | null | undefined,
): SessionHealthCode | null {
  switch (code) {
    case OfferErrorCode.SESSION_REVOKED:
      return 'SESSION_REVOKED';
    case OfferErrorCode.STEAM_COOKIE_EXPIRED:
      return 'STEAM_COOKIE_EXPIRED';
    case OfferErrorCode.STEAM_ACCOUNT_MISMATCH:
      return 'STEAM_ACCOUNT_MISMATCH';
    case OfferErrorCode.INVENTORY_PRIVATE:
      return 'INVENTORY_PRIVATE';
    case OfferErrorCode.INVENTORY_RATE_LIMITED:
      return 'INVENTORY_RATE_LIMITED';
    case OfferErrorCode.INVENTORY_NOT_LOADED:
      return 'INVENTORY_NOT_LOADED';
    default:
      return null;
  }
}

/**
 * Lightweight Steam + extension health probe for popup / order CTAs.
 * Does not require an expected Steam ID unless provided by the caller.
 */
export async function probeSessionHealth(options?: {
  expectedSteamId?: string | null;
  probeInventory?: boolean;
  locale?: ExtensionLocale;
}): Promise<SessionHealth> {
  const locale = options?.locale ?? DEFAULT_EXTENSION_LOCALE;
  const state = await getSessionState();
  const lastDiag = await getLastSessionDiag();

  if (!state || Date.parse(state.expiresAt) <= Date.now()) {
    if (lastDiag?.code === 'SESSION_REVOKED') {
      return buildSessionHealth({
        code: 'SESSION_REVOKED',
        apiBaseUrl: state?.apiBaseUrl,
        messageOverride: lastDiag.message,
        locale,
      });
    }
    return buildSessionHealth({
      code: 'EXT_DISCONNECTED',
      apiBaseUrl: state?.apiBaseUrl,
      locale,
    });
  }

  const hasSession = await hasSteamBrowserSession();
  const sessionSteamId = await resolveLoggedInSteamId();
  if (!hasSession || !sessionSteamId) {
    const health = buildSessionHealth({
      code: 'STEAM_COOKIE_EXPIRED',
      apiBaseUrl: state.apiBaseUrl,
      sessionSteamId,
      expectedSteamId: options?.expectedSteamId,
      locale,
    });
    await saveLastSessionDiag(health);
    return health;
  }

  if (
    options?.expectedSteamId &&
    sessionSteamId !== options.expectedSteamId
  ) {
    const health = buildSessionHealth({
      code: 'STEAM_ACCOUNT_MISMATCH',
      apiBaseUrl: state.apiBaseUrl,
      sessionSteamId,
      expectedSteamId: options.expectedSteamId,
      locale,
    });
    await saveLastSessionDiag(health);
    return health;
  }

  if (options?.probeInventory !== false) {
    const inventory = await loadCs2InventoryFromCookies(sessionSteamId);
    if (inventory.failReason === 'private') {
      const health = buildSessionHealth({
        code: 'INVENTORY_PRIVATE',
        apiBaseUrl: state.apiBaseUrl,
        sessionSteamId,
        expectedSteamId: options?.expectedSteamId,
        messageOverride: inventory.errorMessage,
        locale,
      });
      await saveLastSessionDiag(health);
      return health;
    }
    if (inventory.failReason === 'rate_limited' || inventory.rateLimited) {
      const health = buildSessionHealth({
        code: 'INVENTORY_RATE_LIMITED',
        apiBaseUrl: state.apiBaseUrl,
        sessionSteamId,
        expectedSteamId: options?.expectedSteamId,
        messageOverride: inventory.errorMessage,
        locale,
      });
      await saveLastSessionDiag(health);
      return health;
    }
    if (inventory.failReason === 'not_logged_in') {
      const health = buildSessionHealth({
        code: 'STEAM_COOKIE_EXPIRED',
        apiBaseUrl: state.apiBaseUrl,
        sessionSteamId,
        expectedSteamId: options?.expectedSteamId,
        messageOverride: inventory.errorMessage,
        locale,
      });
      await saveLastSessionDiag(health);
      return health;
    }
  }

  const ok = buildSessionHealth({
    code: 'OK',
    apiBaseUrl: state.apiBaseUrl,
    sessionSteamId,
    expectedSteamId: options?.expectedSteamId,
    locale,
  });
  await clearLastSessionDiag();
  return ok;
}

export function isRetryableSessionHealth(code: SessionHealthCode): boolean {
  return (
    code === 'INVENTORY_RATE_LIMITED' ||
    code === 'INVENTORY_NOT_LOADED' ||
    code === 'STEAM_COOKIE_EXPIRED' ||
    code === 'INVENTORY_PRIVATE'
  );
}

export function toOfferErrorCode(code: SessionHealthCode): OfferErrorCodeType | null {
  switch (code) {
    case 'SESSION_REVOKED':
      return OfferErrorCode.SESSION_REVOKED;
    case 'STEAM_COOKIE_EXPIRED':
      return OfferErrorCode.STEAM_COOKIE_EXPIRED;
    case 'STEAM_ACCOUNT_MISMATCH':
      return OfferErrorCode.STEAM_ACCOUNT_MISMATCH;
    case 'INVENTORY_PRIVATE':
      return OfferErrorCode.INVENTORY_PRIVATE;
    case 'INVENTORY_RATE_LIMITED':
      return OfferErrorCode.INVENTORY_RATE_LIMITED;
    case 'INVENTORY_NOT_LOADED':
      return OfferErrorCode.INVENTORY_NOT_LOADED;
    default:
      return null;
  }
}
