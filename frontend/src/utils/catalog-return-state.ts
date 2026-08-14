const CATALOG_RETURN_STATE_KEY = 'rip_market_catalog_return';

export type CatalogReturnState = {
  pathname: string;
  search: string;
  scrollY: number;
};

export function isCatalogPath(pathname: string): boolean {
  return pathname === '/' || pathname === '/catalog';
}

function normalizeCatalogPath(pathname: string): string {
  return pathname === '/' ? '/catalog' : pathname;
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
    return {
      pathname: parsed.pathname,
      search: parsed.search,
      scrollY: Math.max(0, parsed.scrollY),
    };
  } catch {
    return null;
  }
}

/** Remember catalog list position before opening an item or lot. */
export function rememberCatalogReturnState(): void {
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
    } satisfies CatalogReturnState),
  );
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
    leftSearch === rightSearch
  );
}

/** Returns saved scroll position when the current catalog URL matches the remembered view. */
export function consumeCatalogScrollRestore(): number | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const state = readRawCatalogReturnState();
  if (!state) {
    return null;
  }

  const { pathname, search } = window.location;
  if (!catalogLocationsMatch(pathname, search, state.pathname, state.search)) {
    return null;
  }

  sessionStorage.removeItem(CATALOG_RETURN_STATE_KEY);
  return state.scrollY;
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
