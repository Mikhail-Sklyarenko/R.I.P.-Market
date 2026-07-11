import { expect, test } from '@playwright/test';
import { loginAsBuyer } from './helpers/auth';
import { fundWallet } from './helpers/crypto-payments';
import { processPendingOutbox } from './helpers/outbox';
import { resetDatabase } from './helpers/reset';
import { seedActiveLot } from './helpers/seed';

const API_BASE = process.env.PLAYWRIGHT_API_BASE_URL ?? 'http://localhost:3001/api/v1';

test.describe('Buy complete flow', () => {
  test.beforeEach(async ({ request }) => {
    await resetDatabase(request);
  });

  test('buyer deposit -> buy -> mock-success -> completed with notifications', async ({
    page,
    request,
  }) => {
    const { priceMinor } = await seedActiveLot(request);

    await loginAsBuyer(page);

    await expect(page.getByTestId('catalog-grid').locator('article').first()).toBeVisible();
    await page.getByTestId('catalog-open-lot').first().click();

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
    await page.getByTestId('mock-trade-success').click();
    await expect(page.getByTestId('order-status')).toHaveText('COMPLETED', { timeout: 15000 });
    await expect(page.getByTestId('order-completed-message')).toBeVisible();

    const buyerToken = buyerBody.accessToken;

    const buyerWallet = await request.get(`${API_BASE}/wallet`, {
      headers: { Authorization: `Bearer ${buyerToken}` },
    });
    const buyerWalletBody = (await buyerWallet.json()) as {
      summary: { availableMinor: string };
    };
    expect(Number(buyerWalletBody.summary.availableMinor)).toBe(priceMinor);

    const sellerLogin = await request.post(`${API_BASE}/auth/mock-login`, {
      data: { role: 'SELLER' },
    });
    const sellerToken = ((await sellerLogin.json()) as { accessToken: string }).accessToken;
    const sellerWallet = await request.get(`${API_BASE}/wallet`, {
      headers: { Authorization: `Bearer ${sellerToken}` },
    });
    const sellerWalletBody = (await sellerWallet.json()) as {
      summary: { availableMinor: string };
    };
    expect(Number(sellerWalletBody.summary.availableMinor)).toBe(Math.floor(priceMinor * 0.95));

    await processPendingOutbox(request);

    await expect
      .poll(async () => {
        const notifications = await request.get(`${API_BASE}/me/notifications`, {
          headers: { Authorization: `Bearer ${buyerToken}` },
        });
        const body = (await notifications.json()) as Array<{ eventType: string }>;
        return body.some((item) => item.eventType === 'ORDER_COMPLETED');
      })
      .toBe(true);

    await page.getByTestId('notifications-button').click();
    await expect(page.getByTestId('notification-ORDER_COMPLETED')).toBeVisible({ timeout: 15000 });
  });
});
