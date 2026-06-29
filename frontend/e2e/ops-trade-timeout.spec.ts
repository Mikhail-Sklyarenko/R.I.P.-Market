import { expect, test } from '@playwright/test';
import { buyerPurchaseWaitingTrade, loginAsAdmin, loginAsBuyer } from './helpers/auth';
import { processPendingOutbox } from './helpers/outbox';
import { resetDatabase } from './helpers/reset';
import { seedActiveLot } from './helpers/seed';

const apiBase = () => process.env.PLAYWRIGHT_API_BASE_URL ?? 'http://localhost:3001/api/v1';

test.describe('Ops trade timeout', () => {
  test.beforeEach(async ({ request }) => {
    await resetDatabase(request);
  });

  test('trade timeout opens dispute and admin can resolve', async ({ page, request }) => {
    await seedActiveLot(request);

    await loginAsBuyer(page);
    await buyerPurchaseWaitingTrade(page);

    await page.getByTestId('mock-trade-timeout').click();
    await expect(page.getByTestId('order-status')).toHaveText('DISPUTE', { timeout: 15000 });
    await expect(page.getByTestId('order-dispute-message')).toBeVisible();

    const orderId = page.url().split('/orders/')[1];

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

    await loginAsAdmin(page);
    await page.goto(`/admin/orders/${orderId}`);
    await expect(page.getByTestId('admin-order-status')).toHaveText('DISPUTE');

    await page.getByTestId('admin-action-reason').fill('Trade timed out in Steam');
    await page.getByTestId('admin-resolve-buyer').click();
    await page.getByTestId('admin-reason-modal-confirm').click();

    await expect(page.getByTestId('admin-order-status')).toHaveText('FAILED', { timeout: 15000 });
  });
});
