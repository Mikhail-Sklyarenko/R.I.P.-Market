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

  test('sell panel opens as a centered listing modal', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsSeller(page);

    await page.locator('[data-testid^="list-asset-"]').first().click();
    await expect(page.getByTestId('inventory-sell-panel')).toBeVisible();
    await expect(page.getByTestId('inventory-sell-backdrop')).toBeVisible();
    await expect(page.getByTestId('inventory-listing-overlay')).toBeVisible();

    const panelBox = await page.getByTestId('inventory-sell-panel').boundingBox();
    expect(panelBox).not.toBeNull();
    if (panelBox) {
      expect(panelBox.width).toBeGreaterThan(280);
      expect(panelBox.y).toBeGreaterThan(40);
    }

    await page.getByTestId('inventory-sell-backdrop').click();
    await expect(page.getByTestId('inventory-sell-panel')).toHaveCount(0);
  });
});
