/** Always IPv4 — see playwright.config.ts for why localhost is unsafe here. */
export const API_BASE =
  process.env.PLAYWRIGHT_API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';
