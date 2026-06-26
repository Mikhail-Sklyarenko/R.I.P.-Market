import { expect, test } from '@playwright/test';
import { loginAsBuyer } from './helpers/auth';
import { resetDatabase } from './helpers/reset';
import { seedActiveLot } from './helpers/seed';

test.describe('Buy cancel flow', () => {
  test.beforeEach(async ({ request }) => {
    await resetDatabase(request);
  });

  test('buyer can cancel order and listing returns to catalog', async ({ page }) => {
    const { lotId, priceMinor } = await seedActiveLot(page.request);

    await loginAsBuyer(page);
    await page.goto(`/lots/${lotId}`);

    await page.getByTestId('buy-lot-button').click();
    await expect(page).toHaveURL(/\/wallet/);
    await page.getByTestId('deposit-amount-input').fill('2000');
    await page.getByTestId('deposit-submit').click();

    await page.getByTestId('buy-lot-button').click();
    await expect(page.getByTestId('order-status')).toHaveText('WAITING_TRADE');

    await page.getByTestId('cancel-order-button').click();
    await expect(page.getByTestId('order-status')).toHaveText('CANCELED');
    await expect(page.getByTestId('order-canceled-message')).toBeVisible();

    await page.goto('/catalog');
    await expect(page.getByTestId(`catalog-lot-${lotId}`)).toBeVisible();
  });
});
