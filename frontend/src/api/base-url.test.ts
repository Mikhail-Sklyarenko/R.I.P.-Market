import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

/**
 * Mirror of getApiBaseUrl logic for unit tests without import.meta / window.
 */
function resolveApiBaseUrl(
  configured: string,
  pageHref: string | null,
): string {
  const normalized = configured.replace(/\/$/, '');
  if (!pageHref) {
    return normalized;
  }
  try {
    const api = new URL(normalized, pageHref);
    const page = new URL(pageHref);
    if (!api.pathname.startsWith('/api')) {
      return normalized;
    }
    const stripWww = (h: string) => h.replace(/^www\./i, '').toLowerCase();
    if (
      stripWww(api.hostname) === stripWww(page.hostname) &&
      api.port === page.port
    ) {
      return `${page.origin}${api.pathname.replace(/\/$/, '')}`;
    }
  } catch {
    // keep configured
  }
  return normalized;
}

describe('resolveApiBaseUrl (www / apex)', () => {
  it('rewrites apex API to www page origin', () => {
    assert.equal(
      resolveApiBaseUrl(
        'https://p2pcs.ru/api/v1',
        'https://www.p2pcs.ru/sell/inventory',
      ),
      'https://www.p2pcs.ru/api/v1',
    );
  });

  it('keeps apex when page is apex', () => {
    assert.equal(
      resolveApiBaseUrl('https://p2pcs.ru/api/v1', 'https://p2pcs.ru/catalog'),
      'https://p2pcs.ru/api/v1',
    );
  });

  it('keeps localhost Vite → API port mismatch', () => {
    assert.equal(
      resolveApiBaseUrl(
        'http://localhost:3000/api/v1',
        'http://localhost:5173/',
      ),
      'http://localhost:3000/api/v1',
    );
  });
});
