import { expect, test } from '@playwright/test';
import { loginAsBuyer } from './helpers/auth';
import { resetDatabase } from './helpers/reset';
import { saveSellerTradeOffer, seedOpenOrder } from './helpers/seed';

const API_BASE = process.env.PLAYWRIGHT_API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';

test.describe('Trade verification buyer UX', () => {
  test.beforeEach(async ({ request }) => {
    await resetDatabase(request);
  });

  // The order page polls, so a mocked request is often still in flight when the
  // test ends; without this the pending route callback fails the run.
  test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  });

  test('buyer order page shows trade safety checklist once an offer exists', async ({
    page,
    request,
  }) => {
    const { orderId, sellerToken } = await seedOpenOrder(request);

    await loginAsBuyer(page);
    await page.goto(`/orders/${orderId}`);

    // Before the offer lands there is nothing to check yet, only a wait.
    await expect(page.getByTestId('buyer-trade-panel')).toBeVisible();
    await expect(page.getByTestId('buyer-awaiting-offer-message')).toBeVisible();
    await expect(page.getByTestId('buyer-trade-checklist')).toHaveCount(0);

    await saveSellerTradeOffer(request, sellerToken, orderId);
    await page.reload();

    await expect(page.getByTestId('buyer-trade-checklist')).toBeVisible();
    await expect(page.getByTestId('buyer-steam-offers-link')).toBeVisible();
    await expect(page.getByText('Перед принятием проверьте скин')).toBeVisible();
    await expect(page.getByTestId('trade-counterparty-seller')).toBeVisible();
    await expect(page.getByTestId('trade-scam-warning')).toBeVisible();
    await expect(page.getByTestId('trade-counterparty-steam-id-seller')).toContainText(
      '7656119',
    );
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
            // The hint is what stands in for acknowledgment buttons while
            // acknowledgments are still switched off.
            extensionTradeAcknowledgmentEnabled: false,
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
      /проверка сделки/,
    );
  });
});
