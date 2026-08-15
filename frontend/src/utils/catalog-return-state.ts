const CATALOG_RETURN_STATE_KEY = 'rip_market_catalog_return';
/** Keep return position for a browsing session; drop stale leftovers. */
const CATALOG_RETURN_TTL_MS = 30 * 60 * 1000;

export type CatalogReturnState = {
  pathname: string;
  search: string;
  scrollY: number;
  /** Prefer scrolling this catalog card into view on return. */
  anchorItemId: string | null;
  savedAt: number;
};

export type CatalogReturnRestore = {
  scrollY: number;
  anchorItemId: string | null;
};

export function isCatalogPath(pathname: string): boolean {
  return pathname === '/' || pathname === '/catalog';
}

function normalizeCatalogPath(pathname: string): string {
  return pathname === '/' ? '/catalog' : pathname;
}

/** Stable query string so `?b=1&a=2` matches `?a=2&b=1`. */
export function normalizeCatalogSearch(search: string): string {
  const raw = search.startsWith('?') ? search.slice(1) : search;
  if (!raw.trim()) {
    return '';
  }
  const params = new URLSearchParams(raw);
  const keys = [...new Set([...params.keys()])].sort();
  const normalized = new URLSearchParams();
  for (const key of keys) {
    for (const value of params.getAll(key)) {
      normalized.append(key, value);
    }
  }
  const serialized = normalized.toString();
  return serialized ? `?${serialized}` : '';
}

function isFresh(savedAt: number): boolean {
  return Number.isFinite(savedAt) && Date.now() - savedAt <= CATALOG_RETURN_TTL_MS;
}

function readRawCatalogReturnState(): CatalogReturnState | null {
  if (typeof sessionStorage === 'undefined') {
    return null;
  }

  const raw = sessionStorage.getItem(CATALOG_RETURN_STATE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<CatalogReturnState>;
    if (
      typeof parsed.pathname !== 'string' ||
      typeof parsed.search !== 'string' ||
      typeof parsed.scrollY !== 'number' ||
      !Number.isFinite(parsed.scrollY)
    ) {
      return null;
    }
    const savedAt =
      typeof parsed.savedAt === 'number' && Number.isFinite(parsed.savedAt)
        ? parsed.savedAt
        : 0;
    if (!isFresh(savedAt)) {
      sessionStorage.removeItem(CATALOG_RETURN_STATE_KEY);
      return null;
    }
    const anchorItemId =
      typeof parsed.anchorItemId === 'string' && parsed.anchorItemId.trim()
        ? parsed.anchorItemId.trim()
        : null;
    return {
      pathname: parsed.pathname,
      search: parsed.search,
      scrollY: Math.max(0, parsed.scrollY),
      anchorItemId,
      savedAt,
    };
  } catch {
    return null;
  }
}

/**
 * Remember catalog list position before opening an item or lot.
 * Pass the opened card id so return can scroll that card into view.
 */
export function rememberCatalogReturnState(anchorItemId?: string | null): void {
  if (typeof window === 'undefined') {
    return;
  }

  const { pathname, search } = window.location;
  if (!isCatalogPath(pathname)) {
    return;
  }

  sessionStorage.setItem(
    CATALOG_RETURN_STATE_KEY,
    JSON.stringify({
      pathname,
      search,
      scrollY: window.scrollY,
      anchorItemId: anchorItemId?.trim() ? anchorItemId.trim() : null,
      savedAt: Date.now(),
    } satisfies CatalogReturnState),
  );
}

export function peekCatalogReturnState(): CatalogReturnState | null {
  return readRawCatalogReturnState();
}

export function clearCatalogReturnState(): void {
  if (typeof sessionStorage === 'undefined') {
    return;
  }
  sessionStorage.removeItem(CATALOG_RETURN_STATE_KEY);
}

export function hasCatalogReturnState(): boolean {
  return readRawCatalogReturnState() != null;
}

export function getCatalogReturnHref(fallback = '/catalog'): string {
  const state = readRawCatalogReturnState();
  if (!state || !isCatalogPath(state.pathname)) {
    return fallback;
  }
  return `${state.pathname}${state.search}`;
}

function catalogLocationsMatch(
  leftPath: string,
  leftSearch: string,
  rightPath: string,
  rightSearch: string,
): boolean {
  return (
    normalizeCatalogPath(leftPath) === normalizeCatalogPath(rightPath) &&
    normalizeCatalogSearch(leftSearch) === normalizeCatalogSearch(rightSearch)
  );
}

/**
 * Returns restore payload when the current catalog URL matches the remembered view.
 * Does not clear storage — call `clearCatalogReturnState` after a successful restore.
 */
export function readCatalogReturnRestore(
  currentPath?: string,
  currentSearch?: string,
): CatalogReturnRestore | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const state = readRawCatalogReturnState();
  if (!state) {
    return null;
  }

  const pathname = currentPath ?? window.location.pathname;
  const search = currentSearch ?? window.location.search;
  if (!catalogLocationsMatch(pathname, search, state.pathname, state.search)) {
    return null;
  }

  return {
    scrollY: state.scrollY,
    anchorItemId: state.anchorItemId,
  };
}

/** @deprecated Prefer readCatalogReturnRestore */
export function readCatalogScrollRestore(
  currentPath?: string,
  currentSearch?: string,
): number | null {
  return readCatalogReturnRestore(currentPath, currentSearch)?.scrollY ?? null;
}

/** @deprecated Prefer readCatalogReturnRestore + clearCatalogReturnState */
export function consumeCatalogScrollRestore(): number | null {
  const scrollY = readCatalogScrollRestore();
  if (scrollY != null) {
    clearCatalogReturnState();
  }
  return scrollY;
}

/** Selector for the main catalog grid card (not the popular strip). */
export function catalogMainGridItemSelector(itemId: string): string {
  const safe = itemId.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `[data-testid="catalog-grid"] [data-catalog-item-id="${safe}"]`;
}

export function parseCatalogPageParam(raw: string | null): number {
  if (!raw?.trim()) {
    return 1;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }
  return parsed;
}

export function parseCatalogLimitParam(
  raw: string | null,
  fallback = 48,
): number {
  if (!raw?.trim()) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  if (![24, 48, 96].includes(parsed)) {
    return fallback;
  }
  return parsed;
}
