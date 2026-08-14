import { expect, test } from '@playwright/test';
import { loginAsAdmin } from './helpers/auth';
import { resetDatabase } from './helpers/reset';

const apiBase = () => process.env.PLAYWRIGHT_API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';

test.describe('Admin support tickets', () => {
  test.beforeEach(async ({ request }) => {
    await resetDatabase(request);
  });

  test('admin replies to open ticket and closes it', async ({ page, request }) => {
    const buyerLogin = await request.post(`${apiBase()}/auth/mock-login`, {
      data: { role: 'BUYER' },
    });
    const buyerToken = ((await buyerLogin.json()) as { accessToken: string }).accessToken;

    const createResponse = await request.post(`${apiBase()}/support/tickets`, {
      headers: { Authorization: `Bearer ${buyerToken}` },
      data: {
        subject: 'Другое',
        body: 'Need help with my account settings please.',
      },
    });
    expect(createResponse.ok()).toBeTruthy();
    const ticket = (await createResponse.json()) as { id: string };

    await loginAsAdmin(page);
    await page.goto('/admin/support/tickets');

    const ticketCard = page.getByTestId(`admin-support-ticket-${ticket.id}`);
    await expect(ticketCard).toBeVisible();
    await expect(ticketCard).toContainText('Need help with my account settings please.');

    await page.getByTestId(`admin-support-ticket-reply-${ticket.id}`).fill(
      'We updated your account settings. Please try again.',
    );
    await page.getByTestId(`admin-support-ticket-submit-${ticket.id}`).click();

    await expect(page.getByTestId('admin-support-success')).toContainText('Ответ отправлен');
    await expect(ticketCard).toHaveCount(0);

    const adminLogin = await request.post(`${apiBase()}/auth/mock-login`, {
      data: { role: 'ADMIN' },
    });
    const adminToken = ((await adminLogin.json()) as { accessToken: string }).accessToken;
    const openTickets = await request.get(`${apiBase()}/admin/support/tickets`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const openList = (await openTickets.json()) as { id: string }[];
    expect(openList.some((item) => item.id === ticket.id)).toBe(false);

    const buyerTickets = await request.get(`${apiBase()}/support/tickets`, {
      headers: { Authorization: `Bearer ${buyerToken}` },
    });
    const tickets = (await buyerTickets.json()) as Array<{
      id: string;
      status: string;
      adminReply?: string | null;
    }>;
    const resolved = tickets.find((item) => item.id === ticket.id);
    expect(resolved?.status).toBe('RESOLVED');
    expect(resolved?.adminReply).toContain('updated your account settings');
  });
});
