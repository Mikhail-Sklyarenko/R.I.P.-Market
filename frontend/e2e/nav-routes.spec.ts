import { expect, test } from '@playwright/test';
import { loginAsBuyer, loginAsSeller } from './helpers/auth';
import { resetDatabase } from './helpers/reset';
import { seedActiveLot } from './helpers/seed';

test.describe('Main navigation', () => {
  test.beforeEach(async ({ request }) => {
    await resetDatabase(request);
  });

  test('buyer sees header wallet balance and finance tabs inside wallet page', async ({ page }) => {
    await loginAsBuyer(page);

    await expect(page.getByTestId('nav-catalog')).toBeVisible();
    await expect(page.getByTestId('nav-sell')).toBeVisible();
    await expect(page.getByTestId('nav-faq')).toBeVisible();
    await expect(page.getByTestId('nav-orders')).toHaveCount(0);
    await expect(page.getByTestId('nav-wallet')).toHaveCount(0);
    await expect(page.getByTestId('header-wallet-balance')).toBeVisible();
    await expect(page.getByTestId('header-wallet-deposit')).toHaveCount(0);
    await expect(page.getByTestId('user-menu-deposit')).toHaveCount(0);
    await expect(page.getByTestId('user-menu-withdraw')).toHaveCount(0);
    await expect(page.getByTestId('user-menu-transactions')).toHaveCount(0);

    await page.getByTestId('header-wallet-balance').click();
    await expect(page).toHaveURL(/\/wallet/);
    await expect(page.getByTestId('wallet-tabs')).toBeVisible();
    await expect(page.getByTestId('wallet-tab-deposit')).toBeVisible();
    await expect(page.getByTestId('wallet-tab-withdraw')).toBeVisible();
    await expect(page.getByTestId('wallet-tab-transactions')).toBeVisible();

    await page.getByTestId('user-menu-trigger').click();
    await expect(page.getByTestId('user-menu-panel')).toBeVisible();

    await page.getByTestId('user-menu-deals').click();
    await expect(page).toHaveURL(/\/deals/);

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

  test('faq nav link opens full faq page', async ({ page }) => {
    await loginAsBuyer(page);

    await page.getByTestId('nav-faq').click();
    await expect(page).toHaveURL(/\/faq$/);
    await expect(page.getByTestId('support-faq-section')).toBeVisible();
    await expect(page.getByTestId('support-faq-content')).toBeVisible();
    await expect(page.getByTestId('support-faq-category-general')).toBeVisible();
    await expect(page.getByTestId('faq-support-cta')).toBeVisible();
    await expect(page.getByTestId('support-ticket-subject')).toHaveCount(0);
  });

  test('support widget fab opens quick help', async ({ page }) => {
    await loginAsBuyer(page);

    await page.getByTestId('support-widget-fab').click();
    await expect(page.getByTestId('support-widget-panel')).toBeVisible();
    await expect(page.getByTestId('support-widget-articles')).toBeVisible();
    await expect(page.getByTestId('support-widget-article-widget-withdraw-time')).toBeVisible();
    await expect(page.getByTestId('support-widget-page-link')).toHaveText(/Открыть FAQ/);
    await expect(page.getByTestId('support-widget-ticket-link')).toHaveText(/Создать тикет/);
  });

  test('support widget on faq page links to ticket page', async ({ page }) => {
    await loginAsBuyer(page);

    await page.goto('/faq');
    await page.getByTestId('support-widget-fab').click();
    await expect(page.getByTestId('support-widget-ticket-link')).toHaveText(/Создать тикет/);
    await expect(page.getByTestId('support-widget-page-link')).toHaveCount(0);
  });

  test('support page shows ticket form without faq sidebar', async ({ page }) => {
    await loginAsBuyer(page);

    await page.goto('/support');
    await expect(page.getByTestId('support-page')).toBeVisible();
    await expect(page.getByTestId('support-ticket-subject')).toBeVisible();
    await expect(page.getByTestId('support-faq-section')).toHaveCount(0);
    await expect(page.getByTestId('support-faq-link')).toBeVisible();
  });

  test('faq category collapses on second click', async ({ page }) => {
    await loginAsBuyer(page);
    await page.goto('/faq');

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
