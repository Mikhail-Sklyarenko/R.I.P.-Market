import { expect, test } from '@playwright/test';
import { resetDatabase } from './helpers/reset';
import { seedCatalogLots } from './helpers/seed';

// The catalog lists every seeded skin card, with or without offers. The mock
// inventory seeds three cards — AK-47 and M4A1-S (rifles), AWP (sniper) — and
// seedCatalogLots puts an offer on the AK-47 and the AWP.
const SEEDED_CARDS = 3;

test.describe('Catalog filters', () => {
  test.beforeEach(async ({ request }) => {
    await resetDatabase(request);
  });

  test('category tab filters lots and updates total count', async ({ page, request }) => {
    await seedCatalogLots(request);

    await page.goto('/catalog');
    await expect(page.getByTestId('catalog-total')).toHaveText(
      `Найдено скинов: ${SEEDED_CARDS}`,
    );
    await expect(page.getByTestId('catalog-grid').locator('article')).toHaveCount(
      SEEDED_CARDS,
    );

    await page.getByTestId('catalog-category-tab-rifles').click();
    await expect(page.getByTestId('catalog-category-dropdown-rifles')).toBeVisible();
    await expect(page.getByTestId('catalog-total')).toHaveText(
      `Найдено скинов: ${SEEDED_CARDS}`,
    );
    await page.getByTestId('catalog-category-select-all-rifles').click();
    await expect(page.getByTestId('catalog-total')).toHaveText('Найдено скинов: 2', {
      timeout: 15_000,
    });
    await expect(page.getByTestId('catalog-grid').locator('article')).toHaveCount(2);

    await page.getByTestId('catalog-category-tab-snipers').click();
    await expect(page.getByTestId('catalog-category-dropdown-snipers')).toBeVisible();
    await page.getByTestId('catalog-category-select-all-snipers').click();
    await expect(page.getByTestId('catalog-total')).toHaveText('Найдено скинов: 1');
    await expect(page.getByTestId('catalog-grid').locator('article')).toHaveCount(1);

    await page.getByTestId('catalog-category-tab-all').click();
    await expect(page.getByTestId('catalog-total')).toHaveText(
      `Найдено скинов: ${SEEDED_CARDS}`,
    );
  });

  test('wear filter reduces catalog total', async ({ page, request }) => {
    await seedCatalogLots(request);

    await page.goto('/catalog');
    await expect(page.getByTestId('catalog-total')).toHaveText(
      `Найдено скинов: ${SEEDED_CARDS}`,
    );

    await page.getByTestId('catalog-wear-filter-toggle').click();

    // A wear filter applies to offers, so cards without one drop out entirely.
    await page.getByTestId('catalog-wear-ft').click();
    await expect(page.getByTestId('catalog-total')).toHaveText('Найдено скинов: 1', {
      timeout: 15_000,
    });
    await expect(page.getByTestId('catalog-grid').locator('article')).toHaveCount(1);

    await page.getByTestId('catalog-wear-bs').click();
    await expect(page.getByTestId('catalog-total')).toHaveText('Найдено скинов: 1');
    await expect(page.getByTestId('catalog-grid').locator('article')).toHaveCount(1);

    await page.getByTestId('catalog-wear-all').click();
    await expect(page.getByTestId('catalog-total')).toHaveText(
      `Найдено скинов: ${SEEDED_CARDS}`,
    );
  });

  test('float range filter reduces catalog total', async ({ page, request }) => {
    await seedCatalogLots(request);

    await page.goto('/catalog');
    await expect(page.getByTestId('catalog-total')).toHaveText(
      `Найдено скинов: ${SEEDED_CARDS}`,
    );

    await page.getByTestId('catalog-float-filter-toggle').click();

    await page.getByTestId('catalog-float-min').fill('0.06');
    await expect(page.getByTestId('catalog-total')).toHaveText('Найдено скинов: 1', {
      timeout: 15_000,
    });
    await expect(page.getByTestId('catalog-grid').locator('article')).toHaveCount(1);

    await page.getByTestId('catalog-float-max').fill('0.08');
    await expect(page.getByTestId('catalog-total')).toHaveText('Найдено скинов: 1');

    await page.getByTestId('catalog-float-min').fill('');
    await page.getByTestId('catalog-float-max').fill('');
    await expect(page.getByTestId('catalog-total')).toHaveText(
      `Найдено скинов: ${SEEDED_CARDS}`,
    );
  });

  test('catalog cards use unified price stack layout', async ({ page, request }) => {
    await seedCatalogLots(request);

    await page.goto('/catalog');
    const firstCard = page.getByTestId('catalog-open-lot').first();

    await expect(firstCard.getByTestId(/catalog-item-.*-primary-price/)).toBeVisible();
    await expect(firstCard.getByTestId(/catalog-item-.*-steam-price/)).toBeVisible();
    await expect(firstCard.getByTestId(/catalog-item-.*-market-price/)).toBeAttached();
  });

  test('page size selector updates URL and item count', async ({ page, request }) => {
    await seedCatalogLots(request);

    await page.goto('/catalog');
    await expect(page.getByTestId('catalog-grid').locator('article')).toHaveCount(
      SEEDED_CARDS,
    );

    await page.getByTestId('catalog-page-size').selectOption('24');
    await expect(page).toHaveURL(/limit=24/);
    await expect(page.getByTestId('catalog-grid').locator('article')).toHaveCount(
      SEEDED_CARDS,
    );

    await page.getByTestId('catalog-page-size').selectOption('96');
    await expect(page).toHaveURL(/limit=96/);
    await expect(page.url()).not.toContain('page=');
  });
});
