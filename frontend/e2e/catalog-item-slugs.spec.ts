import { expect, test } from '@playwright/test';
import { resetDatabase } from './helpers/reset';
import { seedCatalogLots } from './helpers/seed';

const API_BASE = process.env.PLAYWRIGHT_API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';

test.describe('Catalog item slugs', () => {
  test.beforeEach(async ({ request }) => {
    await resetDatabase(request);
  });

  test('opens item page by slug and redirects UUID URLs to slug', async ({
    page,
    request,
  }) => {
    await seedCatalogLots(request);

    const catalogResponse = await request.get(`${API_BASE}/catalog/items?page=1&limit=48`);
    expect(catalogResponse.ok()).toBeTruthy();
    const catalog = (await catalogResponse.json()) as {
      items: Array<{ id: string; slug?: string | null; marketHashName: string; activeLotCount: number }>;
    };

    const itemWithoutOffers = catalog.items.find(
      (entry) => entry.activeLotCount === 0 && entry.slug,
    );
    expect(itemWithoutOffers).toBeTruthy();

    const { id, slug } = itemWithoutOffers!;

    await page.goto(`/catalog/items/${slug}`);
    await expect(page.getByTestId('item-page')).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/catalog/items/${slug}$`));
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      new RegExp(`/catalog/items/${slug}$`),
    );

    await page.goto(`/catalog/items/${id}`);
    await expect(page.getByTestId('item-page')).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/catalog/items/${slug}$`));
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      new RegExp(`/catalog/items/${slug}$`),
    );
  });
});
