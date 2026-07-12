import { expect, test } from '@playwright/test';
import { loginAsBuyer, loginAsSeller } from './helpers/auth';
import { fundWallet } from './helpers/crypto-payments';
import { resetDatabase } from './helpers/reset';
import { seedActiveLot, seedOpenOrder } from './helpers/seed';

const API_BASE = process.env.PLAYWRIGHT_API_BASE_URL ?? 'http://localhost:3001/api/v1';

test.describe('Buy error handling', () => {
  test.beforeEach(async ({ request }) => {
    await resetDatabase(request);
  });

  test('redirects to wallet with deposit banner when balance is insufficient', async ({
    page,
    request,
  }) => {
    const { lotId } = await seedActiveLot(page.request);

    await loginAsBuyer(page);
    await page.goto(`/lots/${lotId}`);

    await page.getByTestId('buy-lot-button').click();
    await expect(page).toHaveURL(/\/checkout$/);
    await expect(page.getByTestId('purchase-trade-hint')).toBeVisible();
    await page.getByTestId('checkout-deposit-link').click();
    await expect(page).toHaveURL(/\/wallet/);
    await expect(page.getByTestId('deposit-needed-banner')).toBeVisible();
    await expect(page.getByTestId('deposit-needed-banner')).toBeVisible();
    await expect(page.getByTestId('deposit-needed-banner')).toContainText('1,000.00');

    const buyerLogin = await request.post(`${API_BASE}/auth/mock-login`, {
      data: { role: 'BUYER' },
    });
    const buyerBody = (await buyerLogin.json()) as { accessToken: string };
    await fundWallet(request, buyerBody.accessToken, 200_000);
    await page.goto(`/lots/${lotId}/checkout`);
  });

  test('cannot buy own listing', async ({ page }) => {
    await loginAsSeller(page);

    const listButton = page.locator('[data-testid^="list-asset-"]').first();
    await listButton.click();
    await page.getByTestId('price-input').fill('500');
    await page.getByTestId('submit-listing').click();
    await expect(page).toHaveURL(/\/deals/);

    const lotLink = page.locator('[data-testid^="view-catalog-lot-"]').first();
    await lotLink.click();
    await expect(page.getByTestId('own-lot-message')).toBeVisible();
    await expect(page.getByTestId('buy-lot-button')).toBeDisabled();
  });

  test('reserved listing shows unavailable message', async ({ page, request }) => {
    const { lotId } = await seedOpenOrder(request);

    await loginAsBuyer(page);
    await page.goto(`/lots/${lotId}`);

    await expect(page.getByTestId('lot-unavailable-message')).toContainText('RESERVED');
    await expect(page.getByTestId('buy-lot-button')).toBeDisabled();
  });
});
