import { expect, test } from '@playwright/test';
import { resetDatabase } from './helpers/reset';
import { seedCatalogLots } from './helpers/seed';

test.describe('Catalog filters', () => {
  test.beforeEach(async ({ request }) => {
    await resetDatabase(request);
  });

  test('category tab filters lots and updates total count', async ({ page, request }) => {
    await seedCatalogLots(request);

    await page.goto('/catalog');
    await expect(page.getByTestId('catalog-total')).toHaveText('Найдено лотов: 2');
    await expect(page.getByTestId('catalog-grid').locator('article')).toHaveCount(2);

    await page.getByTestId('catalog-category-tab-rifles').click();
    await expect(page.getByTestId('catalog-total')).toHaveText('Найдено лотов: 1', {
      timeout: 15_000,
    });
    await expect(page.getByTestId('catalog-grid').locator('article')).toHaveCount(1);

    await page.getByTestId('catalog-category-tab-snipers').click();
    await expect(page.getByTestId('catalog-total')).toHaveText('Найдено лотов: 1');
    await expect(page.getByTestId('catalog-grid').locator('article')).toHaveCount(1);

    await page.getByTestId('catalog-category-tab-all').click();
    await expect(page.getByTestId('catalog-total')).toHaveText('Найдено лотов: 2');
  });
});
