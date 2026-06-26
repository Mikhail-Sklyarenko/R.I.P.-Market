import { expect, test } from '@playwright/test';
import { loginAsBuyer } from './helpers/auth';
import { processPendingOutbox } from './helpers/outbox';
import { resetDatabase } from './helpers/reset';
import { seedActiveLot } from './helpers/seed';

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
    await page.getByRole('link', { name: 'View listing' }).first().click();

    await page.getByTestId('buy-lot-button').click();
    await expect(page).toHaveURL(/\/wallet/);

    await page.getByTestId('deposit-amount-input').fill('2000');
    await page.getByTestId('deposit-submit').click();

    await expect(page.getByTestId('buy-lot-button')).toBeVisible();
    await page.getByTestId('buy-lot-button').click();

    await expect(page.getByTestId('order-status')).toHaveText('WAITING_TRADE');
    await page.getByTestId('mock-trade-success').click();
    await expect(page.getByTestId('order-status')).toHaveText('COMPLETED', { timeout: 15000 });
    await expect(page.getByTestId('order-completed-message')).toBeVisible();

    const buyerLogin = await request.post(`${process.env.PLAYWRIGHT_API_BASE_URL ?? 'http://localhost:3001/api/v1'}/auth/mock-login`, {
      data: { role: 'BUYER' },
    });
    const buyerToken = ((await buyerLogin.json()) as { accessToken: string }).accessToken;
    const apiBase = process.env.PLAYWRIGHT_API_BASE_URL ?? 'http://localhost:3001/api/v1';

    const buyerWallet = await request.get(`${apiBase}/wallet`, {
      headers: { Authorization: `Bearer ${buyerToken}` },
    });
    const buyerWalletBody = (await buyerWallet.json()) as {
      summary: { availableMinor: string };
    };
    expect(Number(buyerWalletBody.summary.availableMinor)).toBe(priceMinor);

    const sellerLogin = await request.post(`${apiBase}/auth/mock-login`, {
      data: { role: 'SELLER' },
    });
    const sellerToken = ((await sellerLogin.json()) as { accessToken: string }).accessToken;
    const sellerWallet = await request.get(`${apiBase}/wallet`, {
      headers: { Authorization: `Bearer ${sellerToken}` },
    });
    const sellerWalletBody = (await sellerWallet.json()) as {
      summary: { availableMinor: string };
    };
    expect(Number(sellerWalletBody.summary.availableMinor)).toBe(Math.floor(priceMinor * 0.95));

    await processPendingOutbox(request);

    await expect
      .poll(async () => {
        const notifications = await request.get(`${apiBase}/me/notifications`, {
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
