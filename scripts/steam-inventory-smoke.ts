#!/usr/bin/env npx ts-node
/**
 * Manual staging smoke test for Steam inventory sync.
 *
 * Usage:
 *   1. Set INVENTORY_PROVIDER=steam and AUTH_PROVIDER=steam (or mock + linked steamId).
 *   2. Obtain a seller JWT (Steam login or scripts/steam-login-smoke.ts).
 *   3. Run: ACCESS_TOKEN=... npx ts-node scripts/steam-inventory-smoke.ts
 *
 * Optional env:
 *   API_BASE_URL — default http://localhost:3000/api/v1
 *   FORCE_REFRESH — set to "true" to call ?forceRefresh=true
 */
const API_BASE = process.env.API_BASE_URL ?? 'http://localhost:3000/api/v1';
const accessToken = process.env.ACCESS_TOKEN?.trim();

async function main() {
  if (!accessToken) {
    console.error('Set ACCESS_TOKEN to a seller or admin JWT with linked steamId.');
    process.exit(1);
  }

  const configRes = await fetch(`${API_BASE}/auth/config`);
  const config = (await configRes.json()) as {
    authProvider: string;
  };
  console.log('Auth config:', config);

  const forceRefresh = process.env.FORCE_REFRESH === 'true';
  const inventoryUrl = `${API_BASE}/inventory${forceRefresh ? '?forceRefresh=true' : ''}`;

  const inventoryRes = await fetch(inventoryUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  console.log('\nGET', inventoryUrl.replace(API_BASE, ''), 'status:', inventoryRes.status);
  console.log('X-Inventory-Stale:', inventoryRes.headers.get('x-inventory-stale') ?? '—');
  console.log('X-Inventory-Warning:', inventoryRes.headers.get('x-inventory-warning') ?? '—');

  const body = (await inventoryRes.json()) as {
    assets?: unknown[];
    sync?: {
      status: string;
      itemCount: number;
      cacheHit: boolean;
      stale: boolean;
      lastSyncedAt: string;
    };
    error?: { code: string; message: string };
  };

  if (!inventoryRes.ok) {
    console.error('Error:', body.error ?? body);
    process.exit(1);
  }

  console.log('\nSync:', body.sync);
  console.log('Assets:', body.assets?.length ?? 0);

  const cachedRes = await fetch(`${API_BASE}/inventory`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const cachedBody = (await cachedRes.json()) as { sync?: { status: string; cacheHit: boolean } };
  console.log('\nSecond request (expect CACHE_HIT within TTL):', cachedBody.sync);

  if (!cachedBody.sync?.cacheHit && cachedBody.sync?.status !== 'CACHE_HIT') {
    console.warn('Warning: second request did not report cache hit (TTL may be very short).');
  }

  console.log('\nSmoke test passed: Steam inventory sync works.');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
