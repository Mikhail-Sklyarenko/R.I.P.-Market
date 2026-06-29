import { expect, test } from '@playwright/test';
import { loginAsBuyer, loginAsSeller } from './helpers/auth';
import { resetDatabase } from './helpers/reset';

test.describe('Smoke: sell list and buyer complete', () => {
  test.beforeEach(async ({ request }) => {
    await resetDatabase(request);
  });

  test('seller lists item, buyer purchases via checkout and completes trade', async ({
    page,
  }) => {
    await loginAsSeller(page);

    await page.getByRole('link', { name: 'List item' }).first().click();
    await page.getByTestId('price-input').fill('1000');
    await page.getByTestId('submit-listing').click();
    await expect(page).toHaveURL(/\/sell\/my-lots$/);
    await expect(page.getByTestId('lot-row-ACTIVE')).toBeVisible();

    await page.evaluate(() => localStorage.removeItem('rip_market_auth'));
    await loginAsBuyer(page);

    await page.getByRole('link', { name: 'View listing' }).first().click();
    await page.getByTestId('buy-lot-button').click();
    await expect(page).toHaveURL(/\/checkout$/);
    await expect(page.getByTestId('checkout-page')).toBeVisible();

    await page.getByTestId('checkout-deposit-link').click();
    await page.getByTestId('deposit-amount-input').fill('2000');
    await page.getByTestId('deposit-submit').click();
    await expect(page).toHaveURL(/\/checkout$/);

    await page.getByTestId('confirm-purchase-button').click();
    await expect(page.getByTestId('order-status')).toHaveText('WAITING_TRADE');
    await expect(page.getByTestId('mock-trade-panel')).toBeVisible();

    await page.getByTestId('mock-trade-success').click();
    await expect(page.getByTestId('order-status')).toHaveText('COMPLETED', {
      timeout: 15000,
    });
    await expect(page.getByTestId('order-completed-message')).toBeVisible();
  });
});
