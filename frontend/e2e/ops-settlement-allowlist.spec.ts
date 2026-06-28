import { expect, test } from '@playwright/test';
import { loginAsAdmin } from './helpers/auth';
import { resetDatabase } from './helpers/reset';

const testSteamId = '76561198999999999';

test.describe('Ops settlement allowlist', () => {
  test.beforeEach(async ({ request }) => {
    await resetDatabase(request);
  });

  test('admin can add and remove allowlist entries', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/settlement/allowlist');

    await expect(page.getByRole('heading', { name: 'Settlement allowlist' })).toBeVisible();

    await page.getByTestId('allowlist-steam-id').fill(testSteamId);
    await page.getByRole('button', { name: 'Save entry' }).click();

    const row = page.getByTestId('allowlist-table').locator('tbody tr').filter({
      hasText: testSteamId,
    });
    await expect(row).toBeVisible();
    await expect(row).toContainText('yes');

    page.once('dialog', (dialog) => dialog.accept());
    await row.getByRole('button', { name: 'Remove' }).click();

    await expect(
      page.getByTestId('allowlist-table').locator('tbody tr').filter({ hasText: testSteamId }),
    ).toHaveCount(0);
  });
});
