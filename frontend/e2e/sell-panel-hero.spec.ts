import { expect, test } from '@playwright/test';
import { loginAsSeller } from './helpers/auth';
import { resetDatabase } from './helpers/reset';

test.describe('Sell panel hero polish', () => {
  test.beforeEach(async ({ request }) => {
    await resetDatabase(request);
  });

  test('sell panel hero shows rarity glow like catalog cards', async ({ page }) => {
    await loginAsSeller(page);

    await page.locator('[data-testid^="list-asset-"]').first().click();
    await expect(page.getByTestId('inventory-sell-panel')).toBeVisible();
    await expect(page.getByTestId('lot-item-hero')).toBeVisible();
    await expect(
      page.getByTestId('inventory-sell-panel').locator('.lot-item-hero-rarity-glow'),
    ).toBeVisible();
    await expect(
      page.getByTestId('inventory-sell-panel').locator('.lot-item-hero-rarity-haze'),
    ).toBeVisible();
  });
});
