import { expect, test } from '@playwright/test';
import { buyerPurchaseWaitingTrade, loginAsBuyer } from './helpers/auth';
import { resetDatabase } from './helpers/reset';
import { seedActiveLot } from './helpers/seed';

test.describe('Checkout route', () => {
  test.beforeEach(async ({ request }) => {
    await resetDatabase(request);
  });

  test('lot page buys in place and shows wallet when balance is short', async ({
    page,
    request,
  }) => {
    const { lotId } = await seedActiveLot(request);

    await loginAsBuyer(page);
    await page.goto(`/lots/${lotId}`);

    await expect(page).toHaveURL(new RegExp(`/lots/${lotId}$`));
    await expect(page.getByTestId('lot-purchase-card')).toBeVisible();
    await expect(page.getByTestId('checkout-pricing')).toBeVisible();
    await expect(page.getByTestId('lot-purchase-details')).toBeVisible();
    await expect(page.getByTestId('checkout-deposit-link')).toBeVisible();
    await expect(page.getByTestId('buy-lot-button')).toHaveCount(0);
  });

  test('legacy checkout URL returns to the listing', async ({ page, request }) => {
    const { lotId } = await seedActiveLot(request, 500_000);

    await loginAsBuyer(page);
    await page.goto(`/lots/${lotId}/checkout`);
    await expect(page).toHaveURL(new RegExp(`/lots/${lotId}$`));
    await expect(page.getByTestId('checkout-wallet')).toBeVisible();
    await expect(page.getByTestId('checkout-deposit-link')).toBeVisible();
    await expect(page.getByTestId('buy-lot-button')).toHaveCount(0);
  });
});

test.describe('Smoke checklist', () => {
  test.beforeEach(async ({ request }) => {
    await resetDatabase(request);
  });

  test('catalog buy mock success reaches COMPLETED', async ({ page, request }) => {
    await seedActiveLot(request);
    await loginAsBuyer(page);
    await buyerPurchaseWaitingTrade(page);
    await page.getByTestId('mock-trade-success').click();
    await expect(page.getByTestId('order-status')).toHaveText('COMPLETED', {
      timeout: 15000,
    });
  });
});
