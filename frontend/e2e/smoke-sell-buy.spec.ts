import { expect, test } from '@playwright/test';
import { loginAsBuyer, loginAsSeller, openFirstCatalogLot } from './helpers/auth';
import { fundWallet } from './helpers/crypto-payments';
import { resetDatabase } from './helpers/reset';

const API_BASE = process.env.PLAYWRIGHT_API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';

test.describe('Smoke: sell list and buyer trade confirmation', () => {
  test.beforeEach(async ({ request }) => {
    await resetDatabase(request);
  });

  test('seller lists item, buyer purchases and mock confirmation does not complete payment', async ({
    page,
    request,
  }) => {
    await loginAsSeller(page);

    // Prime the catalog before listing: creation must invalidate its empty-offer cache.
    const beforeListing = await request.get(`${API_BASE}/catalog/items`);
    expect(beforeListing.ok()).toBeTruthy();
    expect((await beforeListing.json()).items.every(
      (item: { activeLotCount: number }) => item.activeLotCount === 0,
    )).toBeTruthy();

    await page.locator('[data-testid^="list-asset-"]').first().click();
    await expect(page.getByTestId('inventory-sell-panel')).toBeVisible();
    await page.getByTestId('price-input').fill('1000');
    await page.getByTestId('submit-listing').click();
    await expect(page.getByTestId('inventory-listing-success')).toBeVisible();
    const afterListing = await request.get(`${API_BASE}/catalog/items`);
    expect(afterListing.ok()).toBeTruthy();
    expect((await afterListing.json()).items.some(
      (item: { activeLotCount: number; minMarketplacePriceMinor: string | null }) =>
        item.activeLotCount === 1 && item.minMarketplacePriceMinor === '100000',
    )).toBeTruthy();
    await page.getByTestId('inventory-listing-success-listings').click();
    await expect(page).toHaveURL(/\/deals/);
    await expect(page.getByTestId('lot-row-ACTIVE')).toBeVisible();

    await page.evaluate(() => localStorage.removeItem('rip_market_auth'));
    await loginAsBuyer(page);

    await openFirstCatalogLot(page);
    await expect(page.getByTestId('lot-purchase-card')).toBeVisible();

    await page.getByTestId('checkout-deposit-link').click();
    await expect(page).toHaveURL(/\/wallet/);
    const returnUrl = new URL(page.url()).searchParams.get('returnUrl');
    const buyerLogin = await request.post(`${API_BASE}/auth/mock-login`, {
      data: { role: 'BUYER' },
    });
    const buyerBody = (await buyerLogin.json()) as { accessToken: string };
    await fundWallet(request, buyerBody.accessToken, 200_000);
    if (returnUrl) {
      await page.goto(returnUrl);
    }

    await page.getByTestId('buy-lot-button').click();
    await expect(page.getByTestId('order-status')).toHaveText('WAITING_TRADE');
    await expect(page.getByTestId('mock-trade-panel')).toBeVisible();

    await page.getByTestId('mock-trade-success').click();
    await expect(page.getByTestId('order-status')).toHaveText('TRADE_CONFIRMED', {
      timeout: 15000,
    });
    await expect(page.getByTestId('order-completed-message')).not.toBeVisible();
  });
});
