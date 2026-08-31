import { apiRequest } from './client.ts';
import type { AuthConfig } from './types.ts';

const CACHE_KEY = 'rip:authConfig:v1';
const CACHE_TTL_MS = 10 * 60 * 1000;

type CachedAuthConfig = {
  savedAt: number;
  config: AuthConfig;
};

let memoryCache: CachedAuthConfig | null = null;

function readSessionCache(): CachedAuthConfig | null {
  if (typeof sessionStorage === 'undefined') {
    return null;
  }
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as CachedAuthConfig;
    if (!parsed?.config || typeof parsed.savedAt !== 'number') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeSessionCache(entry: CachedAuthConfig): void {
  memoryCache = entry;
  if (typeof sessionStorage === 'undefined') {
    return;
  }
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
    // Quota / private mode — memory cache still helps this tab.
  }
}

function isFresh(entry: CachedAuthConfig, now = Date.now()): boolean {
  return now - entry.savedAt < CACHE_TTL_MS;
}

/** Last known auth config (memory → session), even if stale. */
export function peekCachedAuthConfig(): AuthConfig | null {
  if (memoryCache) {
    return memoryCache.config;
  }
  return readSessionCache()?.config ?? null;
}

/**
 * Load `/auth/config` with GET retries (via apiRequest) and session cache.
 * On total network failure, returns a fresh cache hit if present (soft degrade).
 */
export async function loadAuthConfig(options?: {
  force?: boolean;
}): Promise<AuthConfig> {
  const now = Date.now();
  if (!options?.force) {
    const local = memoryCache ?? readSessionCache();
    if (local && isFresh(local, now)) {
      memoryCache = local;
      return local.config;
    }
  }

  try {
    const config = await apiRequest<AuthConfig>('/auth/config', {
      retries: 2,
    });
    writeSessionCache({ savedAt: Date.now(), config });
    return config;
  } catch (error) {
    const stale = memoryCache ?? readSessionCache();
    if (stale) {
      memoryCache = stale;
      return stale.config;
    }
    throw error;
  }
}

/** @internal test helper */
export function clearAuthConfigCacheForTests(): void {
  memoryCache = null;
  if (typeof sessionStorage !== 'undefined') {
    try {
      sessionStorage.removeItem(CACHE_KEY);
    } catch {
      // ignore
    }
  }
}
