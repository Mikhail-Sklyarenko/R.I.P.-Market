import { expect, test } from '@playwright/test';
import { loginAsBuyer, loginAsSeller } from './helpers/auth';
import { resetDatabase } from './helpers/reset';
import { seedActiveLot, seedOpenOrder } from './helpers/seed';

test.describe('Buy error handling', () => {
  test.beforeEach(async ({ request }) => {
    await resetDatabase(request);
  });

  test('redirects to wallet with deposit banner when balance is insufficient', async ({
    page,
  }) => {
    const { lotId } = await seedActiveLot(page.request);

    await loginAsBuyer(page);
    await page.goto(`/lots/${lotId}`);

    await page.getByTestId('buy-lot-button').click();
    await expect(page).toHaveURL(/\/checkout$/);
    await page.getByTestId('checkout-deposit-link').click();
    await expect(page).toHaveURL(/\/wallet/);
    await expect(page.getByTestId('deposit-needed-banner')).toBeVisible();
    await expect(page.getByTestId('deposit-needed-banner')).toContainText('$1,000.00');

    await page.getByTestId('deposit-amount-input').fill('2000');
    await page.getByTestId('deposit-submit').click();
    await expect(page).toHaveURL(new RegExp(`/lots/${lotId}/checkout$`));
  });

  test('seller account cannot buy listings', async ({ page }) => {
    const { lotId } = await seedActiveLot(page.request);

    await loginAsSeller(page);
    await page.goto(`/lots/${lotId}`);

    await expect(page.getByTestId('seller-cannot-buy-message')).toBeVisible();
    await expect(page.getByTestId('buy-lot-button')).toHaveCount(0);
  });

  test('reserved listing shows unavailable message', async ({ page, request }) => {
    const { lotId } = await seedOpenOrder(request);

    await loginAsBuyer(page);
    await page.goto(`/lots/${lotId}`);

    await expect(page.getByTestId('lot-unavailable-message')).toContainText('RESERVED');
    await expect(page.getByTestId('buy-lot-button')).toBeDisabled();
  });
});
