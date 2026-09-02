/**
 * Resolve the API base URL for browser fetches.
 *
 * Staging/prod serve the SPA and `/api` on the same host. The build may hardcode
 * `https://p2pcs.ru/api/v1` while a user opens `https://www.p2pcs.ru` — CSP
 * `connect-src 'self'` then blocks the cross-host fetch. Prefer the page origin
 * when the configured API is the same site (www vs apex) and path is `/api…`.
 *
 * Local Vite (`:5173` → `:3000`) keeps the absolute configured URL.
 */
const viteEnv =
  typeof import.meta !== 'undefined' && import.meta.env
    ? import.meta.env
    : undefined;

const CONFIGURED_API_BASE =
  (typeof viteEnv?.VITE_API_BASE_URL === 'string' &&
    viteEnv.VITE_API_BASE_URL.trim()) ||
  'http://localhost:3000/api/v1';

function stripWww(hostname: string): string {
  return hostname.replace(/^www\./i, '').toLowerCase();
}

export function getConfiguredApiBaseUrl(): string {
  return CONFIGURED_API_BASE.replace(/\/$/, '');
}

export function getApiBaseUrl(): string {
  const configured = getConfiguredApiBaseUrl();
  if (typeof window === 'undefined') {
    return configured;
  }

  try {
    const api = new URL(configured, window.location.origin);
    const page = new URL(window.location.href);
    if (!api.pathname.startsWith('/api')) {
      return configured;
    }

    const sameSite = stripWww(api.hostname) === stripWww(page.hostname);
    const samePort = api.port === page.port;
    if (sameSite && samePort) {
      return `${page.origin}${api.pathname.replace(/\/$/, '')}`;
    }
  } catch {
    // keep configured
  }

  return configured;
}
