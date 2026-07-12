import { expect, test } from '@playwright/test';
import { loginAsSeller } from './helpers/auth';
import { resetDatabase } from './helpers/reset';

test.describe('Seller flow', () => {
  test.beforeEach(async ({ request }) => {
    await resetDatabase(request);
  });

  test('inventory -> create lot -> my sales -> cancel listing', async ({ page }) => {
    await loginAsSeller(page);

    const listButton = page.locator('[data-testid^="list-asset-"]').first();
    await expect(listButton).toBeVisible();
    await listButton.click();
    await expect(page.getByTestId('inventory-sell-panel')).toBeVisible();

    await page.getByTestId('price-input').fill('1000');
    await expect(page.getByTestId('pricing-preview')).toContainText('$1,000.00');
    await expect(page.getByTestId('pricing-preview')).toContainText('$50.00');
    await expect(page.getByTestId('pricing-preview')).toContainText('$950.00');

    await page.getByTestId('submit-listing').click();
    await expect(page).toHaveURL(/\/deals/);

    const activeRow = page.getByTestId('lot-row-ACTIVE');
    await expect(activeRow).toBeVisible();

    await page.getByRole('button', { name: 'Отменить' }).click();
    await expect(page.getByTestId('lot-row-CANCELED')).toBeVisible();
  });

  test('shows understandable error when listing unavailable asset again', async ({ page }) => {
    await loginAsSeller(page);

    const listButton = page.locator('[data-testid^="list-asset-"]').first();
    const assetId = (await listButton.getAttribute('data-testid'))!.replace('list-asset-', '');

    await listButton.click();
    await page.getByTestId('price-input').fill('500');
    await page.getByTestId('submit-listing').click();
    await expect(page).toHaveURL(/\/deals/);

    await page.goto(`/sell/lots/new?assetId=${assetId}`);
    await expect(page.getByText('This item cannot be listed right now')).toBeVisible();
    await expect(page.getByTestId('submit-listing')).toBeDisabled();
  });

  test('shows validation feedback for invalid price', async ({ page }) => {
    await loginAsSeller(page);

    await page.locator('[data-testid^="list-asset-"]').first().click();
    await page.getByTestId('price-input').fill('0');
    await expect(page.getByText('Enter a valid price greater than zero.')).toBeVisible();
    await expect(page.getByTestId('submit-listing')).toBeDisabled();
  });
});
