import { expect, test } from '@playwright/test';
import { loginAsBuyer } from './helpers/auth';
import { resetDatabase } from './helpers/reset';

const MOCK_TRADE_URL =
  'https://steamcommunity.com/tradeoffer/new/?partner=123456789&token=AbCdEfGh';

test.describe('Account trade URL', () => {
  test.beforeEach(async ({ request }) => {
    await resetDatabase(request);
  });

  test('buyer saves trade URL on account page', async ({ page, request }) => {
    await loginAsBuyer(page);
    const profileLoaded = page.waitForResponse(
      (response) =>
        response.url().includes('/users/me') &&
        response.request().method() === 'GET' &&
        response.ok(),
    );
    await page.goto('/account');
    await profileLoaded;

    await expect(page.getByTestId('account-page')).toBeVisible();
    await expect(page.getByTestId('account-trade-url-save')).toBeEnabled();
    await page.getByTestId('account-trade-url-input').fill(MOCK_TRADE_URL);
    await page.getByTestId('account-trade-url-save').click();

    await expect(page.getByTestId('account-trade-url-success')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId('readiness-trade-url')).toBeVisible();

    const buyerLogin = await request.post(
      `${process.env.PLAYWRIGHT_API_BASE_URL ?? 'http://localhost:3001/api/v1'}/auth/mock-login`,
      { data: { role: 'BUYER' } },
    );
    const buyerBody = (await buyerLogin.json()) as { accessToken: string };
    const profile = await request.get(
      `${process.env.PLAYWRIGHT_API_BASE_URL ?? 'http://localhost:3001/api/v1'}/users/me`,
      { headers: { Authorization: `Bearer ${buyerBody.accessToken}` } },
    );
    const me = (await profile.json()) as { tradeUrl?: string | null };
    expect(me.tradeUrl).toBe(MOCK_TRADE_URL);
  });
});
