import { expect, test } from '@playwright/test';
import { buyerPurchaseWaitingTrade, loginAsAdmin, loginAsBuyer } from './helpers/auth';
import { resetDatabase } from './helpers/reset';
import { seedActiveLot } from './helpers/seed';

test.describe('Admin open dispute', () => {
  test.beforeEach(async ({ request }) => {
    await resetDatabase(request);
  });

  test('admin opens dispute from waiting_trade and resolves for buyer', async ({ page }) => {
    await seedActiveLot(page.request);

    await loginAsBuyer(page);
    await buyerPurchaseWaitingTrade(page);

    const orderId = page.url().split('/orders/')[1];

    await loginAsAdmin(page);
    await page.goto(`/admin/orders/${orderId}`);
    await expect(page.getByTestId('admin-order-status')).toHaveText('WAITING_TRADE');

    await page.getByTestId('admin-action-reason').fill('Manual ops escalation');
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByTestId('admin-open-dispute').click();

    await expect(page.getByTestId('admin-order-status')).toHaveText('DISPUTE', { timeout: 15000 });
    await expect(page.getByTestId('admin-action-success')).toContainText('Dispute opened');

    await page.getByTestId('admin-action-reason').fill('Buyer did not receive item');
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByTestId('admin-resolve-buyer').click();

    await expect(page.getByTestId('admin-order-status')).toHaveText('FAILED', { timeout: 15000 });
    await expect(page.getByTestId('admin-order-timeline')).toContainText('DISPUTE');
  });
});
