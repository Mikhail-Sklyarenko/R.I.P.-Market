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
    await expect(page.getByTestId('catalog-total')).toHaveText('Найдено скинов: 2');
    await expect(page.getByTestId('catalog-grid').locator('article')).toHaveCount(2);

    await page.getByTestId('catalog-category-tab-rifles').click();
    await expect(page.getByTestId('catalog-category-dropdown-rifles')).toBeVisible();
    await expect(page.getByTestId('catalog-total')).toHaveText('Найдено скинов: 2');
    await page
      .getByTestId('catalog-category-dropdown-rifles')
      .getByRole('menuitem', { name: 'Все: Винтовки' })
      .click();
    await expect(page.getByTestId('catalog-total')).toHaveText('Найдено скинов: 1', {
      timeout: 15_000,
    });
    await expect(page.getByTestId('catalog-grid').locator('article')).toHaveCount(1);

    await page.getByTestId('catalog-category-tab-snipers').click();
    await expect(page.getByTestId('catalog-category-dropdown-snipers')).toBeVisible();
    await page
      .getByTestId('catalog-category-dropdown-snipers')
      .getByRole('menuitem', { name: 'Все: Снайперские' })
      .click();
    await expect(page.getByTestId('catalog-total')).toHaveText('Найдено скинов: 1');
    await expect(page.getByTestId('catalog-grid').locator('article')).toHaveCount(1);

    await page.getByTestId('catalog-category-tab-all').click();
    await expect(page.getByTestId('catalog-total')).toHaveText('Найдено скинов: 2');
  });

  test('wear filter reduces catalog total', async ({ page, request }) => {
    await seedCatalogLots(request);

    await page.goto('/catalog');
    await expect(page.getByTestId('catalog-total')).toHaveText('Найдено скинов: 2');

    await page.getByTestId('catalog-wear-ft').click();
    await expect(page.getByTestId('catalog-total')).toHaveText('Найдено скинов: 1', {
      timeout: 15_000,
    });
    await expect(page.getByTestId('catalog-grid').locator('article')).toHaveCount(1);

    await page.getByTestId('catalog-wear-bs').click();
    await expect(page.getByTestId('catalog-total')).toHaveText('Найдено скинов: 1');
    await expect(page.getByTestId('catalog-grid').locator('article')).toHaveCount(1);

    await page.getByTestId('catalog-wear-all').click();
    await expect(page.getByTestId('catalog-total')).toHaveText('Найдено скинов: 2');
  });

  test('float range filter reduces catalog total', async ({ page, request }) => {
    await seedCatalogLots(request);

    await page.goto('/catalog');
    await expect(page.getByTestId('catalog-total')).toHaveText('Найдено скинов: 2');

    await page.getByTestId('catalog-float-min').fill('0.06');
    await expect(page.getByTestId('catalog-total')).toHaveText('Найдено скинов: 1', {
      timeout: 15_000,
    });
    await expect(page.getByTestId('catalog-grid').locator('article')).toHaveCount(1);

    await page.getByTestId('catalog-float-max').fill('0.08');
    await expect(page.getByTestId('catalog-total')).toHaveText('Найдено скинов: 1');

    await page.getByTestId('catalog-float-min').fill('');
    await page.getByTestId('catalog-float-max').fill('');
    await expect(page.getByTestId('catalog-total')).toHaveText('Найдено скинов: 2');
  });

  test('catalog cards use unified price stack layout', async ({ page, request }) => {
    await seedCatalogLots(request);

    await page.goto('/catalog');
    const firstCard = page.getByTestId('catalog-open-lot').first();

    await expect(firstCard.getByTestId(/catalog-item-.*-primary-price/)).toBeVisible();
    await expect(firstCard.getByTestId(/catalog-item-.*-steam-price/)).toBeVisible();
    await expect(firstCard.getByTestId(/catalog-item-.*-market-price/)).toBeAttached();
  });
});
