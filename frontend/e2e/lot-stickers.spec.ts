import { expect, test } from '@playwright/test';
import { resetDatabase } from './helpers/reset';
import { seedActiveLot } from './helpers/seed';

test.describe('Lot page stickers', () => {
  test.beforeEach(async ({ request }) => {
    await resetDatabase(request);
  });

  test('shows sticker list from listing snapshot', async ({ page, request }) => {
    const { lotId } = await seedActiveLot(request);

    await page.goto(`/lots/${lotId}`);
    await expect(page.getByTestId('lot-page')).toBeVisible();
    await expect(page.getByTestId('lot-stickers')).toBeVisible();
    await expect(page.getByTestId('lot-sticker-0')).toContainText('Titan');
    await expect(page.getByTestId('lot-sticker-1')).toContainText('Crown');
  });
});
