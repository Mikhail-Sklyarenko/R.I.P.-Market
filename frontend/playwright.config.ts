import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  webServer: [
    {
      command:
        'sh -c "cd ../backend && npm run prisma:migrate:deploy && PORT=3001 npm run start:dev"',
      url: 'http://localhost:3001/api/v1/health',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...process.env,
        PORT: '3001',
        JWT_SECRET: process.env.JWT_SECRET ?? 'playwright-jwt-secret',
        FRONTEND_ORIGIN: 'http://localhost:5173',
        ENABLE_TEST_ROUTES: 'true',
        ENABLE_MOCK_TRADE: 'true',
        ENABLE_MOCK_DEPOSIT: 'true',
        AUTH_PROVIDER: 'mock',
        INVENTORY_PROVIDER: 'mock',
        TRADE_PROVIDER: 'mock',
      },
    },
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 5173',
      cwd: '.',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...process.env,
        VITE_API_BASE_URL: 'http://localhost:3001/api/v1',
        VITE_ENABLE_MOCK_TRADE: 'true',
        PLAYWRIGHT_API_BASE_URL: 'http://localhost:3001/api/v1',
      },
    },
  ],
});
