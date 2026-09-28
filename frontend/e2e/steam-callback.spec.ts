import { expect, test } from '@playwright/test';

test.describe('Steam callback page', () => {
  test('exchanges a one-time code once and navigates home', async ({ page }) => {
    let exchanges = 0;
    const user = {
      id: 'user-1', username: 'steam_user', role: 'BUYER', status: 'ACTIVE',
      steamId: '76561198000000000',
    };
    await page.route('**/api/v1/auth/steam/exchange', async (route) => {
      expect(route.request().method()).toBe('POST');
      expect(route.request().postDataJSON()).toEqual({ code: 'test-code' });
      exchanges += 1;
      await route.fulfill({ json: { accessToken: 'test-token', user } });
    });
    await page.route('**/api/v1/auth/me', (route) => route.fulfill({ json: user }));
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
        token: 'test-token',
        user: expect.objectContaining({
          steamId: '76561198000000000',
          username: 'steam_user',
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
