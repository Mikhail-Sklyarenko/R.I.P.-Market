import { expect, test } from '@playwright/test';
import { loginAsBuyer } from './helpers/auth';
import { resetDatabase } from './helpers/reset';
import { seedOpenOrder } from './helpers/seed';

const API_BASE = process.env.PLAYWRIGHT_API_BASE_URL ?? 'http://localhost:3001/api/v1';

test.describe('Trade verification buyer UX', () => {
  test.beforeEach(async ({ request }) => {
    await resetDatabase(request);
  });

  test('buyer order page shows trade safety checklist', async ({ page, request }) => {
    const { orderId } = await seedOpenOrder(request);

    await loginAsBuyer(page);
    await page.goto(`/orders/${orderId}`);

    await expect(page.getByTestId('buyer-trade-panel')).toBeVisible();
    await expect(page.getByTestId('buyer-trade-checklist')).toBeVisible();
    await expect(page.getByTestId('buyer-steam-offers-link')).toBeVisible();
    await expect(page.getByText('Проверьте перед принятием')).toBeVisible();
  });

  test('extension mode shows trade verification hint on buyer order page', async ({
    page,
    request,
  }) => {
    const { orderId } = await seedOpenOrder(request);

    await page.route('**/auth/config', async (route) => {
      const response = await route.fetch();
      const json = (await response.json()) as Record<string, unknown>;
      const extension = (json.extension as Record<string, unknown> | undefined) ?? {};
      await route.fulfill({
        status: response.status(),
        headers: response.headers(),
        contentType: 'application/json',
        body: JSON.stringify({
          ...json,
          extension: {
            ...extension,
            extensionChannelEnabled: true,
            extensionTaskPipelineEnabled: true,
            extensionTradeAcknowledgmentEnabled: true,
          },
        }),
      });
    });

    await page.route(`${API_BASE}/orders/${orderId}`, async (route) => {
      const response = await route.fetch();
      const order = (await response.json()) as Record<string, unknown>;
      await route.fulfill({
        status: response.status(),
        headers: response.headers(),
        contentType: 'application/json',
        body: JSON.stringify({
          ...order,
          tradeTask: {
            id: 'task-mock-verify',
            type: 'create_offer',
            status: 'DISPATCHED',
            executionPhase: 'ACKED',
            lastErrorCode: null,
            lastErrorMessage: null,
            selectedMarketHashName: null,
            expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
            attemptCount: 1,
            maxAttempts: 5,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        }),
      });
    });

    await loginAsBuyer(page);
    await page.goto(`/orders/${orderId}`);

    await expect(page.getByTestId('buyer-trade-panel')).toBeVisible();
    await expect(page.getByTestId('buyer-extension-hint')).toBeVisible();
    await expect(page.getByTestId('buyer-extension-hint')).toContainText(
      'проверку сделки перед принятием',
    );
  });
});
