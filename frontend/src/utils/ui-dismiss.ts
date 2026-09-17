/**
 * Durable UI dismiss helpers (localStorage + optional TTL).
 * Prefer this over sessionStorage so prompts don't reappear every tab open.
 */

export type UiDismissOptions = {
  /** When set, dismiss expires after this many ms and the prompt can return. */
  ttlMs?: number;
};

type StoredDismiss = {
  at: number;
  ttlMs?: number;
};

function getLocalStorage(): Storage | null {
  try {
    const candidate = (globalThis as { localStorage?: Storage }).localStorage;
    return candidate ?? null;
  } catch {
    return null;
  }
}

function readRaw(key: string): string | null {
  try {
    return getLocalStorage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeRaw(key: string, value: string): void {
  try {
    getLocalStorage()?.setItem(key, value);
  } catch {
    /* private mode / quota */
  }
}

export function isUiDismissed(
  key: string,
  options?: UiDismissOptions,
): boolean {
  const raw = readRaw(key);
  if (!raw) {
    return false;
  }
  if (raw === '1') {
    // Legacy permanent flag
    return true;
  }
  try {
    const parsed = JSON.parse(raw) as StoredDismiss;
    if (!parsed || typeof parsed.at !== 'number') {
      return false;
    }
    const ttl = parsed.ttlMs ?? options?.ttlMs;
    if (ttl == null) {
      return true;
    }
    return Date.now() - parsed.at < ttl;
  } catch {
    return false;
  }
}

export function markUiDismissed(
  key: string,
  options?: UiDismissOptions,
): void {
  const payload: StoredDismiss = {
    at: Date.now(),
    ...(options?.ttlMs != null ? { ttlMs: options.ttlMs } : {}),
  };
  writeRaw(key, JSON.stringify(payload));
}

export function clearUiDismissed(key: string): void {
  try {
    getLocalStorage()?.removeItem(key);
  } catch {
    /* ignore */
  }
}

export const UI_DISMISS_KEYS = {
  oneGesturePair: 'rip.ui.dismiss.oneGesturePair',
  trustBanner: 'rip.ui.dismiss.trustBanner',
  tradeUrlBanner: 'rip.ui.dismiss.tradeUrlBanner',
  sellerOnboarding: 'rip.ui.dismiss.sellerOnboarding',
  extensionHintSell: 'rip.ui.dismiss.extensionHint.sell',
  extensionHintBuy: 'rip.ui.dismiss.extensionHint.buy',
} as const;

export const UI_DISMISS_TTL = {
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
} as const;
