/**
 * Recover a single https origin from trade.siteUrl / support links.
 * Guards against legacy backends that put the whole CORS list into siteUrl:
 * `p2pcs.ru,https://www.p2pcs.ru,...,http://IP/orders/uuid`
 */

const DEFAULT_SITE_ORIGIN = 'https://p2pcs.ru';
const IPV4_HOST = /^(?:\d{1,3}\.){3}\d{1,3}$/;

function scoreOrigin(origin: string, index: number): number {
  try {
    const url = new URL(origin);
    let score = 0;
    if (url.protocol === 'https:') score += 100;
    else if (url.protocol === 'http:') score += 10;
    if (!IPV4_HOST.test(url.hostname) && !url.hostname.includes(':')) {
      score += 50;
    }
    if (!url.hostname.toLowerCase().startsWith('www.')) score += 10;
    score -= Math.min(index, 20);
    return score;
  } catch {
    return Number.NEGATIVE_INFINITY;
  }
}

export function normalizeSiteOriginCandidate(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  let value = raw.trim();
  if (!value || value.includes(',')) return null;
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) {
    value = `https://${value}`;
  }
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname) return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Pick one safe origin from a possibly comma-joined siteUrl blob.
 */
export function resolveSiteOriginFromTradeUrl(
  siteUrl: string | null | undefined,
  fallbackOrigin = DEFAULT_SITE_ORIGIN,
): string {
  const raw = siteUrl?.trim() ?? '';
  if (!raw) {
    return normalizeSiteOriginCandidate(fallbackOrigin) ?? DEFAULT_SITE_ORIGIN;
  }

  // Happy path: single clean order URL.
  if (!raw.includes(',')) {
    const withoutOrder = raw.replace(/\/orders\/[^/?#]+\/?$/, '');
    const origin = normalizeSiteOriginCandidate(withoutOrder);
    if (origin) return origin;
  }

  // Legacy: CORS list glued into siteUrl (with or without /orders/... on the last chunk).
  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
  const candidates: string[] = [];
  for (const part of parts) {
    const withoutOrder = part.replace(/\/orders\/[^/?#]+\/?$/, '');
    const origin = normalizeSiteOriginCandidate(withoutOrder);
    if (origin) candidates.push(origin);
  }

  if (candidates.length === 0) {
    return normalizeSiteOriginCandidate(fallbackOrigin) ?? DEFAULT_SITE_ORIGIN;
  }

  let best = candidates[0]!;
  let bestScore = scoreOrigin(best, 0);
  for (let i = 1; i < candidates.length; i += 1) {
    const score = scoreOrigin(candidates[i]!, i);
    if (score > bestScore) {
      best = candidates[i]!;
      bestScore = score;
    }
  }
  return best;
}

/** Rebuild `/orders/:id` on a safe origin when siteUrl was corrupted. */
export function sanitizeTradeOrderUrl(
  siteUrl: string | null | undefined,
  orderId: string,
  fallbackOrigin = DEFAULT_SITE_ORIGIN,
): string {
  const origin = resolveSiteOriginFromTradeUrl(siteUrl, fallbackOrigin);
  const id = orderId.trim();
  if (!id) {
    return origin;
  }
  // If siteUrl was already a clean single order URL, keep path shape.
  if (siteUrl && !siteUrl.includes(',')) {
    try {
      const url = new URL(
        /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(siteUrl)
          ? siteUrl
          : `https://${siteUrl}`,
      );
      if (url.pathname.includes(`/orders/${id}`)) {
        return `${url.origin}/orders/${id}`;
      }
    } catch {
      // fall through
    }
  }
  return `${origin}/orders/${id}`;
}
