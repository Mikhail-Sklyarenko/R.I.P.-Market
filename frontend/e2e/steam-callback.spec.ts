import { expect, test } from '@playwright/test';
import { resetDatabase } from './helpers/reset';

const API_BASE = process.env.PLAYWRIGHT_API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';

test.describe('Steam callback page', () => {
  test('exchanges a one-time code once and navigates home', async ({ page, request }) => {
    await resetDatabase(request);
    const response = await request.post(`${API_BASE}/auth/mock-login`, { data: { role: 'BUYER' } });
    expect(response.ok()).toBeTruthy();
    const session = await response.json() as { accessToken: string; user: { id: string; username: string } };
    let exchanges = 0;
    await page.route('**/api/v1/auth/steam/exchange', async (route) => {
      expect(route.request().method()).toBe('POST');
      expect(route.request().postDataJSON()).toEqual({ code: 'test-code' });
      exchanges += 1;
      await route.fulfill({ json: session });
    });
    await page.goto('/login/steam/callback?code=test-code');

    await expect(page).toHaveURL(/\/($|catalog\/?$)/);
    expect(exchanges).toBe(1);
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const raw = localStorage.getItem('rip_market_auth');
          if (!raw) {
            return null;
          }
          return JSON.parse(raw) as { token?: string; user?: { steamId?: string } };
        }),
      )
      .toEqual({
        token: session.accessToken,
        user: expect.objectContaining({
          id: session.user.id,
          username: session.user.username,
        }),
      });
  });

  test('shows error when callback is incomplete', async ({ page }) => {
    await page.goto('/login/steam/callback?error=STEAM_AUTH_FAILED&message=Verification%20failed');
    await expect(page.getByRole('alert')).toContainText('Не удалось войти через Steam');
    await expect(page.getByRole('link', { name: 'Вернуться ко входу' })).toBeVisible();
  });

  test('shows actionable copy when Steam is already linked', async ({ page }) => {
    await page.goto('/login/steam/callback?error=STEAM_ALREADY_LINKED');
    await expect(page.getByRole('alert')).toContainText('уже привязан');
    await expect(page.getByRole('link', { name: 'Войти в другой аккаунт' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Открыть аккаунт' })).toBeVisible();
  });
});
