import { expect, test } from '@playwright/test';
import { loginAsSeller } from './helpers/auth';
import { resetDatabase } from './helpers/reset';

test.describe('Seller flow', () => {
  test.beforeEach(async ({ request }) => {
    await resetDatabase(request);
  });

  test('inventory -> create lot -> my sales -> cancel listing', async ({ page }) => {
    await loginAsSeller(page);

    const listButton = page.getByRole('link', { name: 'List item' }).first();
    await expect(listButton).toBeVisible();
    await listButton.click();

    await expect(page).toHaveURL(/\/sell\/lots\/new\?assetId=/);
    await page.getByTestId('price-input').fill('1000');
    await expect(page.getByTestId('pricing-preview')).toContainText('$1,000.00');
    await expect(page.getByTestId('pricing-preview')).toContainText('$50.00');
    await expect(page.getByTestId('pricing-preview')).toContainText('$950.00');

    await page.getByTestId('submit-listing').click();
    await expect(page).toHaveURL(/\/sell\/my-lots$/);

    const activeRow = page.getByTestId('lot-row-ACTIVE');
    await expect(activeRow).toBeVisible();

    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByTestId('lot-row-CANCELED')).toBeVisible();
  });

  test('shows understandable error when listing unavailable asset again', async ({ page }) => {
    await loginAsSeller(page);

    const listButton = page.getByRole('link', { name: 'List item' }).first();
    const href = await listButton.getAttribute('href');
    expect(href).toBeTruthy();

    await listButton.click();
    await page.getByTestId('price-input').fill('500');
    await page.getByTestId('submit-listing').click();
    await expect(page).toHaveURL(/\/sell\/my-lots$/);

    await page.goto(href!);
    await expect(page.getByText('This item cannot be listed right now')).toBeVisible();
    await expect(page.getByTestId('submit-listing')).toBeDisabled();
  });

  test('shows validation feedback for invalid price', async ({ page }) => {
    await loginAsSeller(page);

    await page.getByRole('link', { name: 'List item' }).first().click();
    await page.getByTestId('price-input').fill('0');
    await expect(page.getByText('Enter a valid price greater than zero.')).toBeVisible();
    await expect(page.getByTestId('submit-listing')).toBeDisabled();
  });
});
