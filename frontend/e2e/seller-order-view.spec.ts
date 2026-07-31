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
    await expect(page.getByTestId('trade-poll-status')).toBeVisible();

    // Extension channel may or may not have created a task yet; either way the
    // seller still needs the buyer's trade URL and must not see the mock panel.
    const extensionPanel = page.getByTestId('extension-task-progress');
    const extensionMissing = page.getByTestId('extension-task-missing');
    const waitingMessage = page.getByTestId('seller-waiting-message');
    await expect(
      extensionPanel.or(extensionMissing).or(waitingMessage),
    ).toBeVisible();

    const tradeDetails = page.getByTestId('seller-trade-details');
    if (await tradeDetails.count()) {
      await tradeDetails.locator('summary').click();
    }
    await expect(page.getByTestId('seller-buyer-trade-url')).toBeVisible();
    await expect(page.getByTestId('mock-trade-panel')).toHaveCount(0);
  });
});
