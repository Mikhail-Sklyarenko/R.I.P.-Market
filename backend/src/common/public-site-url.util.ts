/**
 * Canonical public site origin for user-facing links (orders, support, Steam callback).
 *
 * `FRONTEND_ORIGIN` is a CORS allowlist and may be a comma-separated list
 * (https://p2pcs.ru,https://www.p2pcs.ru,...). Never use that string raw in hrefs —
 * it produces broken URLs like `p2pcs.ru,https://www.../support`.
 *
 * Prefer `PUBLIC_SITE_URL=https://p2pcs.ru`. If unset, pick the best candidate
 * from `FRONTEND_ORIGIN` (https > http, hostname > IP, apex > www).
 */

const DEFAULT_DEV_ORIGIN = 'http://localhost:5173';

const IPV4_HOST =
  /^(?:\d{1,3}\.){3}\d{1,3}$/;

export type ResolvePublicSiteOriginInput = {
  publicSiteUrl?: string | null;
  frontendOrigin?: string | null;
  fallback?: string;
};

function stripWrappingQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

/** Normalize one candidate into `protocol://host[:port]` or null. */
export function normalizeSiteOriginCandidate(
  raw: string | null | undefined,
): string | null {
  if (!raw) {
    return null;
  }
  let value = stripWrappingQuotes(raw);
  if (!value || value.includes(',')) {
    return null;
  }
  // Bare host from misconfigured env — assume https for public links.
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) {
    value = `https://${value}`;
  }
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    if (!url.hostname) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

function isIpHostname(hostname: string): boolean {
  return IPV4_HOST.test(hostname) || hostname.includes(':');
}

function scoreOrigin(origin: string, index: number): number {
  try {
    const url = new URL(origin);
    let score = 0;
    if (url.protocol === 'https:') {
      score += 100;
    } else if (url.protocol === 'http:') {
      score += 10;
    }
    if (!isIpHostname(url.hostname)) {
      score += 50;
    }
    // Prefer apex (p2pcs.ru) over www — brand canonical.
    if (!url.hostname.toLowerCase().startsWith('www.')) {
      score += 10;
    }
    // Stable tie-break: earlier in the CORS list wins among equals.
    score -= Math.min(index, 20);
    return score;
  } catch {
    return Number.NEGATIVE_INFINITY;
  }
}

/**
 * Resolve a single absolute origin for links shown to users / extension.
 */
export function resolvePublicSiteOrigin(
  input: ResolvePublicSiteOriginInput = {},
): string {
  const fallback =
    normalizeSiteOriginCandidate(input.fallback) ?? DEFAULT_DEV_ORIGIN;

  const fromPublic = normalizeSiteOriginCandidate(input.publicSiteUrl);
  if (fromPublic) {
    return fromPublic;
  }

  const rawList = stripWrappingQuotes(input.frontendOrigin ?? '');
  if (!rawList) {
    return fallback;
  }

  const candidates = rawList
    .split(',')
    .map((part) => normalizeSiteOriginCandidate(part))
    .filter((origin): origin is string => Boolean(origin));

  if (candidates.length === 0) {
    return fallback;
  }

  let best = candidates[0]!;
  let bestScore = scoreOrigin(best, 0);
  for (let i = 1; i < candidates.length; i += 1) {
    const origin = candidates[i]!;
    const score = scoreOrigin(origin, i);
    if (score > bestScore) {
      best = origin;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Env-backed resolver used by extension active-trades, auth redirects, etc.
 */
export function getPublicSiteOriginFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return resolvePublicSiteOrigin({
    publicSiteUrl: env.PUBLIC_SITE_URL,
    frontendOrigin: env.FRONTEND_ORIGIN,
  });
}
