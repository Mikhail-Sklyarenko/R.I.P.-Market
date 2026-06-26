import { expect, test } from '@playwright/test';
import { buyerPurchaseWaitingTrade, loginAsBuyer } from './helpers/auth';
import { resetDatabase } from './helpers/reset';
import { seedActiveLot } from './helpers/seed';

test.describe('Ops fail-safe flow', () => {
  test.beforeEach(async ({ request }) => {
    await resetDatabase(request);
  });

  test('buyer fail-safe refunds and reopens lot in catalog', async ({ page, request }) => {
    const { priceMinor } = await seedActiveLot(request);

    await loginAsBuyer(page);
    await expect(page.getByTestId('catalog-grid').locator('article').first()).toBeVisible();
    await buyerPurchaseWaitingTrade(page);

    await page.getByTestId('mock-trade-fail-safe').click();
    await expect(page.getByTestId('order-status')).toHaveText('FAILED', { timeout: 15000 });
    await expect(page.getByTestId('order-failed-message')).toBeVisible();

    await page.goto('/catalog');
    await expect(page.getByTestId('catalog-grid').locator('article').first()).toBeVisible();

    const buyerLogin = await request.post(
      `${process.env.PLAYWRIGHT_API_BASE_URL ?? 'http://localhost:3001/api/v1'}/auth/mock-login`,
      { data: { role: 'BUYER' } },
    );
    const buyerToken = ((await buyerLogin.json()) as { accessToken: string }).accessToken;
    const apiBase = process.env.PLAYWRIGHT_API_BASE_URL ?? 'http://localhost:3001/api/v1';
    const buyerWallet = await request.get(`${apiBase}/wallet`, {
      headers: { Authorization: `Bearer ${buyerToken}` },
    });
    const buyerWalletBody = (await buyerWallet.json()) as {
      summary: { availableMinor: string };
    };
    expect(Number(buyerWalletBody.summary.availableMinor)).toBe(priceMinor * 2);
  });
});
