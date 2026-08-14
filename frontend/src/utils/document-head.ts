const CANONICAL_LINK_ID = 'rip-market-canonical';
const DEFAULT_DOCUMENT_TITLE = 'R.I.P. Market';

export function resolveSiteOrigin(): string {
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }

  const fromEnv = import.meta.env.VITE_SITE_ORIGIN;
  if (typeof fromEnv === 'string' && fromEnv.trim()) {
    return fromEnv.trim().replace(/\/$/, '');
  }

  return '';
}

export function buildCanonicalUrl(path: string, origin = resolveSiteOrigin()): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${origin}${normalizedPath}`;
}

export function buildPageTitle(pageTitle: string, siteName = DEFAULT_DOCUMENT_TITLE): string {
  const trimmed = pageTitle.trim();
  if (!trimmed) {
    return siteName;
  }
  return `${trimmed} — ${siteName}`;
}

export function setDocumentCanonical(path: string | null): void {
  if (typeof document === 'undefined') {
    return;
  }

  const existing = document.getElementById(CANONICAL_LINK_ID) as HTMLLinkElement | null;
  if (!path) {
    existing?.remove();
    return;
  }

  const href = buildCanonicalUrl(path);
  if (existing) {
    existing.href = href;
    return;
  }

  const link = document.createElement('link');
  link.id = CANONICAL_LINK_ID;
  link.rel = 'canonical';
  link.href = href;
  document.head.appendChild(link);
}

export function getDefaultDocumentTitle(): string {
  return DEFAULT_DOCUMENT_TITLE;
}
