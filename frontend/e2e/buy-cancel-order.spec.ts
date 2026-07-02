import { expect, test } from '@playwright/test';
import { loginAsBuyer } from './helpers/auth';
import { fundWallet } from './helpers/crypto-payments';
import { resetDatabase } from './helpers/reset';
import { seedActiveLot } from './helpers/seed';

const API_BASE = process.env.PLAYWRIGHT_API_BASE_URL ?? 'http://localhost:3001/api/v1';

test.describe('Buy cancel flow', () => {
  test.beforeEach(async ({ request }) => {
    await resetDatabase(request);
  });

  test('buyer can cancel order and listing returns to catalog', async ({ page, request }) => {
    const { lotId } = await seedActiveLot(page.request);

    await loginAsBuyer(page);
    await page.goto(`/lots/${lotId}`);

    await page.getByTestId('buy-lot-button').click();
    await expect(page).toHaveURL(/\/checkout$/);
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

    await page.getByTestId('cancel-order-button').click();
    await expect(page.getByTestId('order-status')).toHaveText('CANCELED');
    await expect(page.getByTestId('order-canceled-message')).toBeVisible();

    await page.goto('/catalog');
    await expect(page.getByTestId(`catalog-lot-${lotId}`)).toBeVisible();
  });
});
