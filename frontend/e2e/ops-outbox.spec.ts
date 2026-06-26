import { expect, test } from '@playwright/test';
import { loginAsAdmin } from './helpers/auth';
import { resetDatabase } from './helpers/reset';
import { seedOpenOrder } from './helpers/seed';

const apiBase = () => process.env.PLAYWRIGHT_API_BASE_URL ?? 'http://localhost:3001/api/v1';

test.describe('Admin outbox ops', () => {
  test.beforeEach(async ({ request }) => {
    await resetDatabase(request);
  });

  test('process pending outbox events after order creation', async ({ page, request }) => {
    await seedOpenOrder(request);

    const adminLogin = await request.post(`${apiBase()}/auth/mock-login`, {
      data: { role: 'ADMIN' },
    });
    const adminToken = ((await adminLogin.json()) as { accessToken: string }).accessToken;
    const pendingBefore = await request.get(`${apiBase()}/admin/outbox?status=PENDING`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const pendingEvents = (await pendingBefore.json()) as unknown[];
    expect(pendingEvents.length).toBeGreaterThan(0);

    await loginAsAdmin(page);
    await page.goto('/admin/outbox');
    await page.getByTestId('outbox-filter-PENDING').click();

    await expect(page.getByTestId('admin-outbox-list')).toContainText('ORDER_CREATED');

    await page.getByTestId('outbox-process-pending').click();
    await expect(page.getByTestId('outbox-success-message')).toContainText('Processed', {
      timeout: 15000,
    });

    await page.getByTestId('outbox-filter-PROCESSED').click();
    await expect(page.getByTestId('outbox-row-PROCESSED').first()).toBeVisible();
  });

  test('retry queues a pending outbox event', async ({ page, request }) => {
    const { orderId } = await seedOpenOrder(request);

    const adminLogin = await request.post(`${apiBase()}/auth/mock-login`, {
      data: { role: 'ADMIN' },
    });
    const adminToken = ((await adminLogin.json()) as { accessToken: string }).accessToken;

    const outbox = await request.get(`${apiBase()}/admin/outbox?status=PENDING`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const events = (await outbox.json()) as Array<{ id: string; aggregateId: string }>;
    const orderEvent = events.find((event) => event.aggregateId === orderId);
    expect(orderEvent).toBeTruthy();

    await loginAsAdmin(page);
    await page.goto('/admin/outbox');
    await page.getByTestId('outbox-filter-PENDING').click();

    await page.getByTestId(`outbox-retry-${orderEvent!.id}`).click();
    await expect(page.getByTestId('outbox-success-message')).toContainText('queued for retry');
  });
});
