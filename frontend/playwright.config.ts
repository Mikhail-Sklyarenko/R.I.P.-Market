import { defineConfig } from '@playwright/test';

// Prefer 127.0.0.1 over localhost: Node on macOS often resolves localhost to
// ::1 first, and Nest bound to 0.0.0.0/127.0.0.1 will refuse the IPv6 dial.
const API_ORIGIN = 'http://127.0.0.1:3001';
const APP_ORIGIN = 'http://127.0.0.1:5173';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  use: {
    baseURL: APP_ORIGIN,
    trace: 'on-first-retry',
  },
  webServer: [
    {
      command:
        'sh -c "cd ../backend && npm run prisma:migrate:deploy && PORT=3001 npm run start:dev"',
      url: `${API_ORIGIN}/api/v1/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...process.env,
        PORT: '3001',
        HOST: '127.0.0.1',
        JWT_SECRET: process.env.JWT_SECRET ?? 'playwright-jwt-secret',
        FRONTEND_ORIGIN: APP_ORIGIN,
        ENABLE_TEST_ROUTES: 'true',
        ENABLE_MOCK_TRADE: 'true',
        ENABLE_MOCK_DEPOSIT: 'false',
        ENABLE_EXTENSION_CHANNEL: 'true',
        PAYMENT_PROVIDER: 'crypto_tron',
        CRYPTO_GATEWAY_WEBHOOK_SECRET:
          process.env.CRYPTO_GATEWAY_WEBHOOK_SECRET ?? 'playwright-webhook-secret',
        MIN_DEPOSIT_MINOR: '100',
        MIN_WITHDRAW_MINOR: '500',
        WITHDRAW_FEE_MINOR: '100',
        WITHDRAW_MANUAL_REVIEW: 'true',
        WITHDRAW_MANUAL_REVIEW_COUNT: '5',
        WITHDRAW_REQUIRE_STEAM_LINKED: 'true',
        AUTH_PROVIDER: 'mock',
        INVENTORY_PROVIDER: 'mock',
        TRADE_PROVIDER: 'mock',
        STEAM_MARKET_PRICE_ENABLED: 'false',
        STEAM_ITEM_ICON_ENABLED: 'false',
      },
    },
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 5173',
      cwd: '.',
      url: APP_ORIGIN,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...process.env,
        VITE_API_BASE_URL: `${API_ORIGIN}/api/v1`,
        VITE_ENABLE_MOCK_TRADE: 'true',
        PLAYWRIGHT_API_BASE_URL: `${API_ORIGIN}/api/v1`,
        CRYPTO_GATEWAY_WEBHOOK_SECRET: 'playwright-webhook-secret',
      },
    },
  ],
});
