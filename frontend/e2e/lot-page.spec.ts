import { expect, test } from '@playwright/test';
import { loginAsBuyer } from './helpers/auth';
import { resetDatabase } from './helpers/reset';
import { seedSimilarLots } from './helpers/seed';

test.describe('Lot page', () => {
  test.beforeEach(async ({ request }) => {
    await resetDatabase(request);
  });

  test('shows wear bar, pattern, buy button, and similar lots', async ({ page, request }) => {
    const { sourceLotId, similarLotId } = await seedSimilarLots(request);

    await page.goto(`/lots/${sourceLotId}`);
    await expect(page.getByTestId('lot-page')).toBeVisible();
    await expect(page.getByTestId('lot-item-hero')).toBeVisible();
    await expect(page.getByTestId('float-spectrum')).toBeVisible();
    await expect(page.getByTestId('float-spectrum-value')).toBeVisible();
    await expect(page.getByTestId('lot-attr-pattern')).toHaveText('100');
    await expect(page.getByTestId('lot-attr-wear')).toBeVisible();
    await expect(page.getByTestId('lot-attr-rarity')).toBeVisible();
    await expect(page.getByTestId('buy-lot-button')).toBeVisible();
    await expect(page.getByTestId('buy-lot-button')).toHaveText('Войти для покупки');

    await expect(page.getByTestId('similar-lots')).toBeVisible();
    await expect(page.getByTestId(`similar-lot-${similarLotId}`)).toBeVisible();
  });

  test('logged-in buyer sees purchase CTA on active lot', async ({ page, request }) => {
    const { sourceLotId } = await seedSimilarLots(request);

    await loginAsBuyer(page);
    await page.goto(`/lots/${sourceLotId}`);

    await expect(page.getByTestId('buy-lot-button')).toHaveText('Купить сейчас');
    await expect(page.getByTestId('lot-purchase-price')).toBeVisible();
  });
});
