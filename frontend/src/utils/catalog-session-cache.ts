import type { CatalogItem } from '../api/types';

export const CATALOG_SESSION_TTL_MS = 30 * 60 * 1000;
const CATALOG_SESSION_STORAGE_KEY = 'rip_market_catalog_session';

export type CatalogSessionSnapshot = {
  queryKey: string;
  items: CatalogItem[];
  total: number;
  steamPrices: Record<string, number | null>;
  steamPriceFetchedAt: string | null;
  loadedPage: number;
  pageLimit: number;
  popularItems: CatalogItem[];
  savedAt: number;
};

const memoryCache = new Map<string, CatalogSessionSnapshot>();

function isFresh(savedAt: number): boolean {
  return Number.isFinite(savedAt) && Date.now() - savedAt <= CATALOG_SESSION_TTL_MS;
}

export function catalogSessionCoversPages(
  snapshot: CatalogSessionSnapshot,
  loadedPage: number,
  pageLimit: number,
): boolean {
  if (snapshot.pageLimit !== pageLimit) {
    return false;
  }
  const needed = Math.min(
    Math.max(loadedPage, 1) * pageLimit,
    snapshot.total || Number.POSITIVE_INFINITY,
  );
  if (!Number.isFinite(needed)) {
    return snapshot.loadedPage >= loadedPage && snapshot.items.length > 0;
  }
  return snapshot.items.length >= needed;
}

export function sliceCatalogSessionItems(
  snapshot: CatalogSessionSnapshot,
  loadedPage: number,
  pageLimit: number,
): CatalogItem[] {
  return snapshot.items.slice(0, Math.max(loadedPage, 1) * pageLimit);
}

function readStorageMap(): Record<string, CatalogSessionSnapshot> {
  if (typeof sessionStorage === 'undefined') {
    return {};
  }
  try {
    const raw = sessionStorage.getItem(CATALOG_SESSION_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as Record<string, CatalogSessionSnapshot>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeStorageMap(map: Record<string, CatalogSessionSnapshot>): void {
  if (typeof sessionStorage === 'undefined') {
    return;
  }
  try {
    sessionStorage.setItem(CATALOG_SESSION_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Quota or private mode — memory cache still works for this tab session.
  }
}

export function readCatalogSession(queryKey: string): CatalogSessionSnapshot | null {
  const memory = memoryCache.get(queryKey);
  if (memory && isFresh(memory.savedAt)) {
    return memory;
  }
  if (memory) {
    memoryCache.delete(queryKey);
  }

  const stored = readStorageMap()[queryKey];
  if (!stored || stored.queryKey !== queryKey || !isFresh(stored.savedAt)) {
    return null;
  }
  memoryCache.set(queryKey, stored);
  return stored;
}

export function writeCatalogSession(snapshot: CatalogSessionSnapshot): void {
  const next: CatalogSessionSnapshot = {
    ...snapshot,
    savedAt: Date.now(),
  };
  memoryCache.set(snapshot.queryKey, next);
  const map = readStorageMap();
  map[snapshot.queryKey] = next;
  const keys = Object.keys(map);
  if (keys.length > 8) {
    const oldest = keys
      .map((key) => map[key])
      .filter((entry): entry is CatalogSessionSnapshot => Boolean(entry))
      .sort((left, right) => left.savedAt - right.savedAt)[0];
    if (oldest) {
      delete map[oldest.queryKey];
      memoryCache.delete(oldest.queryKey);
    }
  }
  writeStorageMap(map);
}

export function clearCatalogSession(): void {
  memoryCache.clear();
  if (typeof sessionStorage === 'undefined') {
    return;
  }
  sessionStorage.removeItem(CATALOG_SESSION_STORAGE_KEY);
}
