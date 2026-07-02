import { expect, test } from '@playwright/test';
import { loginAsBuyer, loginAsSeller } from './helpers/auth';
import { resetDatabase } from './helpers/reset';
import { seedActiveLot } from './helpers/seed';

test.describe('Main navigation', () => {
  test.beforeEach(async ({ request }) => {
    await resetDatabase(request);
  });

  test('buyer sees catalog, my orders, and wallet in nav', async ({ page }) => {
    await loginAsBuyer(page);

    await expect(page.getByTestId('nav-catalog')).toBeVisible();
    await expect(page.getByTestId('nav-orders')).toBeVisible();
    await expect(page.getByTestId('nav-wallet')).toBeVisible();
    await expect(page.getByTestId('nav-sell')).toHaveCount(0);

    await page.getByTestId('nav-orders').click();
    await expect(page).toHaveURL(/\/my\/orders$/);

    await page.getByTestId('nav-wallet').click();
    await expect(page).toHaveURL(/\/wallet$/);

    await page.getByTestId('nav-catalog').click();
    await expect(page).toHaveURL(/\/catalog$/);
  });

  test('seller sees sell nav and inventory route', async ({ page }) => {
    await loginAsSeller(page);

    await expect(page.getByTestId('nav-sell')).toBeVisible();
    await page.getByTestId('nav-sell').click();
    await expect(page).toHaveURL(/\/sell\/inventory$/);
  });

  test('guest can open catalog and lot without auth', async ({ page, request }) => {
    await seedActiveLot(request);
    await page.goto('/catalog');
    await expect(page.getByTestId('catalog-grid')).toBeVisible();

    await page.getByTestId('catalog-open-lot').first().click();
    await expect(page).toHaveURL(/\/lots\//);
    await expect(page.getByTestId('buy-lot-button')).toBeVisible();
  });
});
