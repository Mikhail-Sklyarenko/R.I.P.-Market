import { expect, test } from '@playwright/test';
import type { CatalogItem } from '../src/api/types';

function buildMockCatalogItem(index: number): CatalogItem {
  return {
    id: `mock-item-${index}`,
    slug: `mock-item-${index}`,
    marketHashName: `Mock Rifle | Skin ${index} (Field-Tested)`,
    weapon: 'Rifle',
    rarity: 'Classified',
    iconUrl: null,
    minMarketplacePriceMinor: '100000',
    activeLotCount: 1,
    orderCount30d: 0,
    steamPriceMinor: 120000,
    buffPriceMinor: null,
    csfloatPriceMinor: null,
    featuredLotId: `mock-lot-${index}`,
  };
}

test.describe('Catalog load more', () => {
  test('appends the next batch without replacing existing cards', async ({ page }) => {
    await page.route('**/api/v1/catalog/items**', async (route) => {
      const url = new URL(route.request().url());
      const pageNumber = Number.parseInt(url.searchParams.get('page') ?? '1', 10);
      const limit = Number.parseInt(url.searchParams.get('limit') ?? '48', 10);
      const start = (pageNumber - 1) * limit + 1;
      const end = start + limit - 1;
      const items = Array.from({ length: limit }, (_, offset) =>
        buildMockCatalogItem(start + offset),
      );

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items,
          page: pageNumber,
          limit,
          total: limit + 12,
          steamPriceFetchedAt: null,
        }),
      });
    });

    await page.route('**/api/v1/catalog/popular**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.goto('/catalog?limit=24');
    await expect(page.getByTestId('catalog-grid').locator('article')).toHaveCount(24);
    await expect(page.getByTestId('catalog-load-more-button')).toBeVisible();

    await page.getByTestId('catalog-load-more-button').click();
    await expect(page.getByTestId('catalog-grid').locator('article')).toHaveCount(48);
    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByTestId('catalog-load-more-count')).toContainText('48');
  });
});
