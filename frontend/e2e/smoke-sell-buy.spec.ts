import { expect, test } from '@playwright/test';
import { loginAsBuyer, loginAsSeller } from './helpers/auth';
import { fundWallet } from './helpers/crypto-payments';
import { resetDatabase } from './helpers/reset';

const API_BASE = process.env.PLAYWRIGHT_API_BASE_URL ?? 'http://localhost:3001/api/v1';

test.describe('Smoke: sell list and buyer complete', () => {
  test.beforeEach(async ({ request }) => {
    await resetDatabase(request);
  });

  test('seller lists item, buyer purchases via checkout and completes trade', async ({
    page,
    request,
  }) => {
    await loginAsSeller(page);

    await page.locator('[data-testid^="list-asset-"]').first().click();
    await expect(page.getByTestId('inventory-sell-panel')).toBeVisible();
    await page.getByTestId('price-input').fill('1000');
    await page.getByTestId('submit-listing').click();
    await expect(page).toHaveURL(/\/sell\/activity/);
    await expect(page.getByTestId('lot-row-ACTIVE')).toBeVisible();

    await page.evaluate(() => localStorage.removeItem('rip_market_auth'));
    await loginAsBuyer(page);

    await page.getByTestId('catalog-open-lot').first().click();
    await page.getByTestId('buy-lot-button').click();
    await expect(page).toHaveURL(/\/checkout$/);
    await expect(page.getByTestId('checkout-page')).toBeVisible();

    await page.getByTestId('checkout-deposit-link').click();
    await expect(page).toHaveURL(/\/wallet/);
    const returnUrl = new URL(page.url()).searchParams.get('returnUrl');
    const buyerLogin = await request.post(`${API_BASE}/auth/mock-login`, {
      data: { role: 'BUYER' },
    });
    const buyerBody = (await buyerLogin.json()) as { accessToken: string };
    await fundWallet(request, buyerBody.accessToken, 200_000);
    if (returnUrl) {
      await page.goto(returnUrl);
    }

    await page.getByTestId('confirm-purchase-button').click();
    await expect(page.getByTestId('order-status')).toHaveText('WAITING_TRADE');
    await expect(page.getByTestId('mock-trade-panel')).toBeVisible();

    await page.getByTestId('mock-trade-success').click();
    await expect(page.getByTestId('order-status')).toHaveText('COMPLETED', {
      timeout: 15000,
    });
    await expect(page.getByTestId('order-completed-message')).toBeVisible();
  });
});
