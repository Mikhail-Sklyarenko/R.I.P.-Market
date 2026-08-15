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
    activeLotCount: 0,
    orderCount30d: 0,
    steamPriceMinor: 120000,
    buffPriceMinor: null,
    csfloatPriceMinor: null,
    featuredLotId: null,
  };
}

test.describe('Catalog return to results', () => {
  test('back-to-results restores page and keeps accumulated cards', async ({ page }) => {
    await page.route('**/api/v1/catalog/items**', async (route) => {
      const url = new URL(route.request().url());
      // Detail requests look like /catalog/items/:id — skip those here.
      if (/\/catalog\/items\/[^/?]+/.test(url.pathname)) {
        await route.fallback();
        return;
      }
      const pageNumber = Number.parseInt(url.searchParams.get('page') ?? '1', 10);
      const limit = Number.parseInt(url.searchParams.get('limit') ?? '48', 10);
      const start = (pageNumber - 1) * limit + 1;
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
          total: 60,
          steamPriceFetchedAt: null,
        }),
      });
    });

    await page.route('**/api/v1/catalog/popular**', async (route) => {
      // Delay popular strip so restore must wait for layout to settle.
      await new Promise((resolve) => setTimeout(resolve, 250));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([buildMockCatalogItem(9001), buildMockCatalogItem(9002)]),
      });
    });

    await page.route(/\/api\/v1\/catalog\/items\/[^/?]+/, async (route) => {
      const url = new URL(route.request().url());
      const id = url.pathname.split('/').pop()!;
      const index = Number.parseInt(id.replace('mock-item-', ''), 10) || 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...buildMockCatalogItem(index),
          availableWears: ['FT'],
          catalogSeeded: true,
        }),
      });
    });

    await page.route('**/api/v1/lots**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], page: 1, limit: 50, total: 0 }),
      });
    });

    await page.goto('/catalog?limit=24');
    await expect(page.getByTestId('catalog-grid').locator('article')).toHaveCount(24);
    await page.getByTestId('catalog-load-more-button').click();
    await expect(page.getByTestId('catalog-grid').locator('article')).toHaveCount(48);
    await expect(page).toHaveURL(/page=2/);

    const targetCard = page.getByTestId('catalog-grid').locator('article').nth(30);
    const targetId = await targetCard.getAttribute('data-catalog-item-id');
    expect(targetId).toBeTruthy();
    await targetCard.click();
    await expect(page.getByTestId('catalog-back-to-results')).toBeVisible();
    await page.getByTestId('catalog-back-to-results').click();

    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByTestId('catalog-grid').locator('article')).toHaveCount(48);
    const restoredCard = page.locator(
      `[data-testid="catalog-grid"] [data-catalog-item-id="${targetId}"]`,
    );
    await expect(restoredCard).toBeInViewport();
  });
});
