import { expect, test } from '@playwright/test';
import { loginAsSeller } from './helpers/auth';
import { resetDatabase } from './helpers/reset';
import { seedOpenOrder } from './helpers/seed';

const API_BASE = process.env.PLAYWRIGHT_API_BASE_URL ?? 'http://localhost:3001/api/v1';

const PHASE_LABELS: Record<string, string> = {
  ACKED: 'Расширение взяло задачу',
  TRADE_PAGE_OPENED: 'Открыли страницу обмена',
  ITEM_SELECTED: 'Добавили предмет',
  OFFER_SUBMITTED: 'Отправляем обмен',
};

test.describe('Extension task phase progression (mock API)', () => {
  test.beforeEach(async ({ request }) => {
    await resetDatabase(request);
  });

  test('seller order page shows extension task phases advancing', async ({
    page,
    request,
  }) => {
    const { orderId } = await seedOpenOrder(request);
    const phases = [
      'ACKED',
      'TRADE_PAGE_OPENED',
      'ITEM_SELECTED',
      'OFFER_SUBMITTED',
    ] as const;
    let orderPhaseStartedAt: number | null = null;

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
            extensionUiTradeFlowEnabled: true,
          },
        }),
      });
    });

    await page.route(`${API_BASE}/orders/${orderId}`, async (route) => {
      const response = await route.fetch();
      const order = (await response.json()) as Record<string, unknown>;
      if (orderPhaseStartedAt === null) {
        orderPhaseStartedAt = Date.now();
      }
      const elapsedMs = Date.now() - orderPhaseStartedAt;
      const phaseIndex = Math.min(Math.floor(elapsedMs / 2_500), phases.length - 1);
      const phase = phases[phaseIndex];

      await route.fulfill({
        status: response.status(),
        headers: response.headers(),
        contentType: 'application/json',
        body: JSON.stringify({
          ...order,
          tradeTask: {
            id: 'task-mock-1',
            type: 'create_offer',
            status: 'DISPATCHED',
            executionPhase: phase,
            lastErrorCode: null,
            lastErrorMessage: null,
            selectedMarketHashName:
              phase === 'ITEM_SELECTED'
                ? 'AK-47 | Redline (Field-Tested)'
                : null,
            expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
            attemptCount: 1,
            maxAttempts: 5,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        }),
      });
    });

    await loginAsSeller(page);
    await page.goto(`/orders/${orderId}`);

    await expect(page.getByTestId('extension-task-progress')).toBeVisible();
    await expect(page.getByTestId('extension-task-phase')).toContainText(
      PHASE_LABELS.ACKED,
    );

    await expect(page.getByTestId('extension-task-phase')).toContainText(
      PHASE_LABELS.TRADE_PAGE_OPENED,
      { timeout: 12_000 },
    );

    await expect(page.getByTestId('extension-task-phase')).toContainText(
      PHASE_LABELS.ITEM_SELECTED,
      { timeout: 12_000 },
    );
    await expect(page.getByTestId('extension-task-selected-item')).toBeVisible();

    await expect(page.getByTestId('extension-task-phase')).toContainText(
      PHASE_LABELS.OFFER_SUBMITTED,
      { timeout: 12_000 },
    );
  });
});
