import { expect, test } from '@playwright/test';
import { buyerPurchaseWaitingTrade, loginAsAdmin, loginAsBuyer } from './helpers/auth';
import { processPendingOutbox } from './helpers/outbox';
import { resetDatabase } from './helpers/reset';
import { seedActiveLot } from './helpers/seed';

const apiBase = () => process.env.PLAYWRIGHT_API_BASE_URL ?? 'http://localhost:3001/api/v1';

test.describe('Ops dispute flow', () => {
  test.beforeEach(async ({ request }) => {
    await resetDatabase(request);
  });

  test('dispute -> admin resolve buyer refunds and reopens lot', async ({ page, request }) => {
    const { priceMinor } = await seedActiveLot(request);

    await loginAsBuyer(page);
    await buyerPurchaseWaitingTrade(page);
    await page.getByTestId('mock-trade-fail-dispute').click();
    await expect(page.getByTestId('order-status')).toHaveText('DISPUTE', { timeout: 15000 });

    const buyerLogin = await request.post(`${apiBase()}/auth/mock-login`, {
      data: { role: 'BUYER' },
    });
    const buyerToken = ((await buyerLogin.json()) as { accessToken: string }).accessToken;

    await processPendingOutbox(request);

    await expect
      .poll(async () => {
        const notifications = await request.get(`${apiBase()}/me/notifications`, {
          headers: { Authorization: `Bearer ${buyerToken}` },
        });
        const body = (await notifications.json()) as Array<{ eventType: string }>;
        return body.some((item) => item.eventType === 'ORDER_DISPUTE_OPENED');
      })
      .toBe(true);

    const orderUrl = page.url();
    const orderId = orderUrl.split('/orders/')[1];

    await loginAsAdmin(page);
    await page.goto(`/admin/orders/${orderId}`);
    await expect(page.getByTestId('admin-order-status')).toHaveText('DISPUTE');

    await page.getByTestId('admin-action-reason').fill('Buyer did not receive item');
    await page.getByTestId('admin-resolve-buyer').click();
    await page.getByTestId('admin-reason-modal-confirm').click();

    await expect(page.getByTestId('admin-order-status')).toHaveText('FAILED', { timeout: 15000 });
    await expect(page.getByTestId('admin-action-success')).toContainText('buyer');

    const buyerWallet = await request.get(`${apiBase()}/wallet`, {
      headers: { Authorization: `Bearer ${buyerToken}` },
    });
    const buyerWalletBody = (await buyerWallet.json()) as {
      summary: { availableMinor: string };
    };
    expect(Number(buyerWalletBody.summary.availableMinor)).toBe(priceMinor * 2);
  });

  test('dispute -> admin resolve seller completes sale', async ({ page, request }) => {
    const { priceMinor } = await seedActiveLot(request);

    await loginAsBuyer(page);
    await buyerPurchaseWaitingTrade(page);
    await page.getByTestId('mock-trade-fail-dispute').click();
    await expect(page.getByTestId('order-status')).toHaveText('DISPUTE', { timeout: 15000 });

    const orderId = page.url().split('/orders/')[1];

    await loginAsAdmin(page);
    await page.goto(`/admin/orders/${orderId}`);
    await page.getByTestId('admin-action-reason').fill('Seller delivered item');
    await page.getByTestId('admin-resolve-seller').click();
    await page.getByTestId('admin-reason-modal-confirm').click();

    await expect(page.getByTestId('admin-order-status')).toHaveText('COMPLETED', { timeout: 15000 });

    const sellerLogin = await request.post(`${apiBase()}/auth/mock-login`, {
      data: { role: 'SELLER' },
    });
    const sellerToken = ((await sellerLogin.json()) as { accessToken: string }).accessToken;
    const sellerWallet = await request.get(`${apiBase()}/wallet`, {
      headers: { Authorization: `Bearer ${sellerToken}` },
    });
    const sellerWalletBody = (await sellerWallet.json()) as {
      summary: { availableMinor: string };
    };
    expect(Number(sellerWalletBody.summary.availableMinor)).toBe(Math.floor(priceMinor * 0.95));
  });
});
