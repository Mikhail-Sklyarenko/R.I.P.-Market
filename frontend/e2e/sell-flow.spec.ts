import { expect, test } from '@playwright/test';
import { resetDatabase } from './helpers/reset';

test.describe('Seller flow', () => {
  test.beforeEach(async ({ request }) => {
    await resetDatabase(request);
  });

  test('inventory -> create lot -> my sales', async ({ page }) => {
    await page.goto('/login');

    await page.getByRole('button', { name: 'Continue as mock seller' }).click();
    await expect(page).toHaveURL(/\/sell\/inventory$/);

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

    await expect(page.getByTestId('lot-row-ACTIVE')).toBeVisible();
    await expect(page.getByTestId('my-lots-table')).toContainText('ACTIVE');
  });

  test('shows understandable error when listing unavailable asset again', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Continue as mock seller' }).click();

    const listButton = page.getByRole('link', { name: 'List item' }).first();
    const href = await listButton.getAttribute('href');
    expect(href).toBeTruthy();

    await listButton.click();
    await page.getByTestId('price-input').fill('500');
    await page.getByTestId('submit-listing').click();
    await expect(page).toHaveURL(/\/sell\/my-lots$/);

    await page.goto(href!);
    await page.getByTestId('price-input').fill('500');
    await page.getByTestId('submit-listing').click();

    await expect(page.getByRole('alert')).toContainText('already has an active listing');
    await expect(page.getByRole('alert')).toContainText('LOT_ALREADY_EXISTS_FOR_ASSET');
  });

  test('shows validation feedback for invalid price', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Continue as mock seller' }).click();

    await page.getByRole('link', { name: 'List item' }).first().click();
    await page.getByTestId('price-input').fill('0');
    await expect(page.getByText('Enter a valid price greater than zero.')).toBeVisible();
    await expect(page.getByTestId('submit-listing')).toBeDisabled();
  });
});
