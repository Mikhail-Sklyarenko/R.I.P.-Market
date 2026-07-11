import { expect, test } from '@playwright/test';
import { loginAsBuyer, loginAsSeller } from './helpers/auth';
import { resetDatabase } from './helpers/reset';
import { seedActiveLot } from './helpers/seed';

test.describe('Main navigation', () => {
  test.beforeEach(async ({ request }) => {
    await resetDatabase(request);
  });

  test('buyer sees catalog in header and orders or wallet in user menu', async ({ page }) => {
    await loginAsBuyer(page);

    await expect(page.getByTestId('nav-catalog')).toBeVisible();
    await expect(page.getByTestId('nav-sell')).toBeVisible();
    await expect(page.getByTestId('nav-faq')).toBeVisible();
    await expect(page.getByTestId('nav-orders')).toHaveCount(0);
    await expect(page.getByTestId('nav-wallet')).toHaveCount(0);
    await expect(page.getByTestId('header-wallet-balance')).toBeVisible();
    await expect(page.getByTestId('header-wallet-deposit')).toBeVisible();

    await page.getByTestId('user-menu-trigger').click();
    await expect(page.getByTestId('user-menu-panel')).toBeVisible();

    await page.getByTestId('user-menu-orders').click();
    await expect(page).toHaveURL(/\/my\/orders$/);

    await page.getByTestId('user-menu-trigger').click();
    await page.getByTestId('user-menu-transactions').click();
    await expect(page).toHaveURL(/\/wallet$/);

    await page.getByTestId('nav-catalog').click();
    await expect(page).toHaveURL(/\/catalog$/);
  });

  test('seller sees sell nav and inventory route', async ({ page }) => {
    await loginAsSeller(page);

    await expect(page.getByTestId('nav-sell')).toBeVisible();
    await page.getByTestId('nav-sell').click();
    await expect(page).toHaveURL(/\/sell\/inventory$/);
  });

  test('guest can open catalog and lot without auth', async ({ page, request }) => {
    await seedActiveLot(request);
    await page.goto('/catalog');
    await expect(page.getByTestId('catalog-grid')).toBeVisible();

    await page.getByTestId('catalog-open-lot').first().click();
    await expect(page).toHaveURL(/\/lots\//);
    await expect(page.getByTestId('buy-lot-button')).toBeVisible();
  });

  test('faq nav link opens full support page', async ({ page }) => {
    await loginAsBuyer(page);

    await page.getByTestId('nav-faq').click();
    await expect(page).toHaveURL(/\/support$/);
    await expect(page.getByTestId('support-faq-section')).toBeVisible();
    await expect(page.getByTestId('support-faq-content')).toBeVisible();
    await expect(page.getByTestId('support-faq-category-general')).toBeVisible();
  });

  test('support widget fab opens quick help', async ({ page }) => {
    await loginAsBuyer(page);

    await page.getByTestId('support-widget-fab').click();
    await expect(page.getByTestId('support-widget-panel')).toBeVisible();
    await expect(page.getByTestId('support-widget-articles')).toBeVisible();
    await expect(page.getByTestId('support-widget-article-widget-withdraw-time')).toBeVisible();
    await expect(page.getByTestId('support-widget-page-link')).toHaveText(/Все вопросы/);
  });

  test('support widget on faq page links to ticket form', async ({ page }) => {
    await loginAsBuyer(page);

    await page.goto('/support');
    await page.getByTestId('support-widget-fab').click();
    await expect(page.getByTestId('support-widget-ticket-link')).toHaveText(/Создать тикет/);
    await expect(page.getByTestId('support-widget-page-link')).toHaveCount(0);
  });

  test('faq category collapses on second click', async ({ page }) => {
    await loginAsBuyer(page);
    await page.goto('/support');

    const generalCategory = page.getByTestId('support-faq-category-general');
    await expect(generalCategory.getByRole('button', { name: /Общие вопросы/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    await generalCategory.getByRole('button', { name: /Общие вопросы/ }).click();
    await expect(generalCategory.getByRole('button', { name: /Общие вопросы/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    await expect(page.getByTestId('support-faq-content')).toBeVisible();
  });
});
