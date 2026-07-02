import { expect, test } from '@playwright/test';

test.describe('Steam callback page', () => {
  test('stores JWT from callback query and navigates home', async ({ page }) => {
    await page.goto(
      '/login/steam/callback?accessToken=test-token&userId=user-1&username=steam_user&role=BUYER&status=ACTIVE&steamId=76561198000000000',
    );

    await expect(page).toHaveURL(/\/catalog$/);
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
