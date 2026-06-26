import { expect, test } from '@playwright/test';
import { loginAsSeller } from './helpers/auth';
import { resetDatabase } from './helpers/reset';

test.describe('Inventory sync UI', () => {
  test.beforeEach(async ({ request }) => {
    await resetDatabase(request);
  });

  test('shows sync metadata and tradable items on load', async ({ page }) => {
    await loginAsSeller(page);

    await expect(page.getByText(/Last synced:/)).toBeVisible();
    await expect(page.getByTestId('inventory-refresh')).toBeVisible();
    await expect(page.getByRole('link', { name: 'List item' }).first()).toBeVisible();
  });

  test('refresh from Steam reloads inventory', async ({ page }) => {
    await loginAsSeller(page);

    const lastSynced = page.getByText(/Last synced:/);
    await expect(lastSynced).toBeVisible();

    await page.getByTestId('inventory-refresh').click();
    await expect(page.getByTestId('inventory-refresh')).toHaveText('Refreshing…');
    await expect(page.getByTestId('inventory-refresh')).toHaveText('Refresh from Steam', {
      timeout: 15_000,
    });
    await expect(lastSynced).toBeVisible();
    await expect(page.getByRole('link', { name: 'List item' }).first()).toBeVisible();
  });
});
