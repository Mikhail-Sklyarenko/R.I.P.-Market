import { expect, test } from '@playwright/test';
import { loginAsBuyer } from './helpers/auth';
import { fundWallet } from './helpers/crypto-payments';
import { resetDatabase } from './helpers/reset';
import { seedActiveLot } from './helpers/seed';

const API_BASE = process.env.PLAYWRIGHT_API_BASE_URL ?? 'http://localhost:3001/api/v1';

test.describe('Wallet hold and refund', () => {
  test.beforeEach(async ({ request }) => {
    await resetDatabase(request);
  });

  test('hold increases during purchase and returns after cancel', async ({ page, request }) => {
    const { lotId, priceMinor } = await seedActiveLot(request);

    await loginAsBuyer(page);
    await page.goto('/wallet');
    await expect(page.getByTestId('wallet-hold')).toContainText('$0.00');

    await page.goto(`/lots/${lotId}`);
    await page.getByTestId('buy-lot-button').click();
    await expect(page).toHaveURL(new RegExp(`/lots/${lotId}/checkout$`));

    await page.getByTestId('checkout-deposit-link').click();
    await expect(page).toHaveURL(/\/wallet/);

    const buyerLogin = await request.post(`${API_BASE}/auth/mock-login`, {
      data: { role: 'BUYER' },
    });
    const buyerBody = (await buyerLogin.json()) as { accessToken: string };
    await fundWallet(request, buyerBody.accessToken, 200_000);
    await page.goto(`/lots/${lotId}/checkout`);

    await page.getByTestId('confirm-purchase-button').click();
    await expect(page.getByTestId('order-status')).toHaveText('WAITING_TRADE');
    await expect(page).toHaveURL(/\/orders\//);
    const orderUrl = page.url();

    await page.goto('/wallet');
    const expectedHold = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(priceMinor / 100);
    await expect(page.getByTestId('wallet-hold')).toContainText(expectedHold);
    await expect(page.getByTestId('wallet-hold-info')).toBeVisible();

    await page.goto(orderUrl);
    await page.getByTestId('cancel-order-button').click();
    await expect(page.getByTestId('order-status')).toHaveText('CANCELED');

    await page.goto('/wallet');
    await expect(page.getByTestId('wallet-hold')).toContainText('$0.00');
    await expect(page.getByTestId('wallet-available')).toContainText('$2,000.00');
  });
});
