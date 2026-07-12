import { expect, test } from '@playwright/test';
import { loginAsBuyer, loginAsSeller } from './helpers/auth';
import { fundWallet } from './helpers/crypto-payments';
import { resetDatabase } from './helpers/reset';
import { seedActiveLot } from './helpers/seed';

const API_BASE = process.env.PLAYWRIGHT_API_BASE_URL ?? 'http://localhost:3001/api/v1';

test.describe('Unified user trading', () => {
  test.beforeEach(async ({ request }) => {
    await resetDatabase(request);
  });

  test('seller mock account can buy another users listing', async ({ page, request }) => {
    const { lotId } = await seedActiveLot(request);

    await loginAsSeller(page);

    const sellerLogin = await request.post(`${API_BASE}/auth/mock-login`, {
      data: { role: 'SELLER' },
    });
    const sellerBody = (await sellerLogin.json()) as { accessToken: string };
    await fundWallet(request, sellerBody.accessToken, 200_000);

    await page.goto(`/lots/${lotId}`);
    await expect(page.getByTestId('buy-lot-button')).toBeEnabled();
    await page.getByTestId('buy-lot-button').click();
    await expect(page).toHaveURL(/\/checkout$/);
    await page.getByTestId('confirm-purchase-button').click();
    await expect(page.getByTestId('order-status')).toHaveText('WAITING_TRADE');
  });

  test('buyer can open unified deals hub with purchases tab', async ({ page }) => {
    await loginAsBuyer(page);

    await page.goto('/deals?tab=purchases');
    await expect(page.getByTestId('deals-page')).toBeVisible();
    await expect(page.getByTestId('deals-tab-purchases')).toHaveClass(/active/);
  });
});
