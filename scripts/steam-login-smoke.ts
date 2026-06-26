#!/usr/bin/env npx ts-node
/**
 * Manual staging smoke test for Steam OpenID login.
 *
 * Usage:
 *   1. Set AUTH_PROVIDER=steam and STEAM_OPENID_REALM to your API origin.
 *   2. Run: npx ts-node scripts/steam-login-smoke.ts
 *   3. Open the printed URL in a browser, complete Steam login.
 *   4. After redirect, paste the accessToken from the callback URL when prompted.
 *
 * Requires: API running, FRONTEND_ORIGIN configured, real Steam account.
 */
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const API_BASE = process.env.API_BASE_URL ?? 'http://localhost:3000/api/v1';

async function main() {
  const configRes = await fetch(`${API_BASE}/auth/config`);
  const config = (await configRes.json()) as {
    authProvider: string;
    steamLoginAvailable: boolean;
  };

  console.log('Auth config:', config);
  if (!config.steamLoginAvailable) {
    console.error('Steam login is not available. Set AUTH_PROVIDER=steam.');
    process.exit(1);
  }

  const returnUrl = `${API_BASE}/auth/steam/callback`;
  const loginUrlRes = await fetch(
    `${API_BASE}/auth/steam/login-url?returnUrl=${encodeURIComponent(returnUrl)}`,
  );
  const loginUrlPayload = (await loginUrlRes.json()) as { url: string };
  console.log('\nOpen this URL in a browser and complete Steam login:\n');
  console.log(loginUrlPayload.url);
  console.log(
    '\nAfter redirect you will land on /login/steam/callback?accessToken=...\n',
  );

  const rl = readline.createInterface({ input, output });
  const accessToken = await rl.question('Paste accessToken from callback URL: ');
  rl.close();

  if (!accessToken.trim()) {
    console.error('No token provided.');
    process.exit(1);
  }

  const inventoryRes = await fetch(`${API_BASE}/inventory`, {
    headers: { Authorization: `Bearer ${accessToken.trim()}` },
  });
  console.log('\nGET /inventory status:', inventoryRes.status);
  const inventoryBody = await inventoryRes.text();
  console.log('Response:', inventoryBody.slice(0, 500));

  if (!inventoryRes.ok) {
    process.exit(1);
  }

  console.log('\nSmoke test passed: JWT works with linked Steam user.');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
