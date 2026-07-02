import { expect, test } from '@playwright/test';
import { buyerPurchaseWaitingTrade, loginAsBuyer } from './helpers/auth';
import { resetDatabase } from './helpers/reset';
import { seedActiveLot } from './helpers/seed';

test.describe('Checkout route', () => {
  test.beforeEach(async ({ request }) => {
    await resetDatabase(request);
  });

  test('lot page routes to checkout with pricing preview', async ({ page, request }) => {
    const { lotId } = await seedActiveLot(request);

    await loginAsBuyer(page);
    await page.goto(`/lots/${lotId}`);
    await page.getByTestId('buy-lot-button').click();

    await expect(page).toHaveURL(new RegExp(`/lots/${lotId}/checkout$`));
    await expect(page.getByTestId('checkout-page')).toBeVisible();
    await expect(page.getByTestId('checkout-pricing')).toBeVisible();
    await expect(page.getByTestId('purchase-trade-hint')).toBeVisible();
    await expect(page.getByTestId('escrow-notice')).toBeVisible();
    await expect(page.getByTestId('checkout-deposit-link')).toBeVisible();
  });

  test('checkout blocks purchase without sufficient balance', async ({ page, request }) => {
    const { lotId } = await seedActiveLot(request, 500_000);

    await loginAsBuyer(page);
    await page.goto(`/lots/${lotId}/checkout`);
    await expect(page.getByTestId('checkout-wallet')).toBeVisible();
    await expect(page.getByTestId('checkout-deposit-link')).toBeVisible();
    await expect(page.getByTestId('confirm-purchase-button')).toHaveCount(0);
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
