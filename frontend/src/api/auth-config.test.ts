import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  clearAuthConfigCacheForTests,
  loadAuthConfig,
  peekCachedAuthConfig,
} from './auth-config.ts';
import type { AuthConfig } from './types.ts';

const sampleConfig = {
  authProvider: 'steam',
  steamLoginAvailable: true,
  mockLoginAvailable: false,
} as AuthConfig;

describe('loadAuthConfig cache', () => {
  afterEach(() => {
    clearAuthConfigCacheForTests();
  });

  it('soft-degrades to cache when a forced refresh fails', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify(sampleConfig), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })) as typeof fetch;

    try {
      const first = await loadAuthConfig({ force: true });
      assert.equal(first.steamLoginAvailable, true);
      assert.equal(peekCachedAuthConfig()?.steamLoginAvailable, true);

      globalThis.fetch = (async () => {
        throw new TypeError('Failed to fetch');
      }) as typeof fetch;

      const degraded = await loadAuthConfig({ force: true });
      assert.equal(degraded.steamLoginAvailable, true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
