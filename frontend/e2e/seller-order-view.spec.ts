import { expect, test } from '@playwright/test';
import { loginAsSeller } from './helpers/auth';
import { resetDatabase } from './helpers/reset';
import { seedOpenOrder } from './helpers/seed';

test.describe('Seller order visibility', () => {
  test.beforeEach(async ({ request }) => {
    await resetDatabase(request);
  });

  test('seller sees reserved order in my orders', async ({ page, request }) => {
    const { orderId } = await seedOpenOrder(request);

    await loginAsSeller(page);
    await page.goto('/deals?tab=sales');

    await expect(page.getByTestId('my-orders-table')).toContainText('WAITING_TRADE');
    await expect(page.getByTestId(`open-order-${orderId}`)).toBeVisible();

    await page.getByTestId(`open-order-${orderId}`).click();
    await expect(page).toHaveURL(new RegExp(`/orders/${orderId}$`));
    await expect(page.getByTestId('order-role')).toHaveText('Продавец');

    // With the extension channel on, the extension drives the offer and the
    // manual instructions move behind a collapsed fallback.
    await expect(page.getByTestId('extension-task-progress')).toBeVisible();
    await expect(page.getByTestId('trade-poll-status')).toBeVisible();

    await page.getByTestId('seller-trade-details').locator('summary').click();
    await expect(page.getByTestId('seller-buyer-trade-url')).toBeVisible();

    await expect(page.getByTestId('mock-trade-panel')).toHaveCount(0);
  });
});
