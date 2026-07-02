import { expect, test } from '@playwright/test';
import {
  VALID_TEST_ADDRESS,
  fundWallet,
  linkSteamForUser,
  simulateWithdrawalPaid,
} from './helpers/crypto-payments';
import { resetDatabase } from './helpers/reset';
import { loginAsSeller } from './helpers/auth';

const API_BASE = process.env.PLAYWRIGHT_API_BASE_URL ?? 'http://localhost:3001/api/v1';

test.describe('Wallet crypto withdrawal', () => {
  test.beforeEach(async ({ request }) => {
    await resetDatabase(request);
  });

  test('creates withdrawal, admin approves, webhook marks paid', async ({
    page,
    request,
  }) => {
    const sellerLogin = await request.post(`${API_BASE}/auth/mock-login`, {
      data: { role: 'SELLER' },
    });
    const sellerBody = (await sellerLogin.json()) as {
      accessToken: string;
      user: { id: string };
    };

    await linkSteamForUser(request, sellerBody.user.id);
    await fundWallet(request, sellerBody.accessToken, 10_000);

    await loginAsSeller(page);
    await page.goto('/wallet');

    await page.getByTestId('withdraw-address-input').fill(VALID_TEST_ADDRESS);
    await page.getByTestId('withdraw-amount-input').fill('20');
    await expect(page.getByTestId('withdraw-net-amount')).toContainText('19.00 USDT');
    await page.getByTestId('withdraw-submit').click();

    await expect(page.getByTestId('wallet-crypto-withdrawals')).toBeVisible();
    const statusCell = page.locator('[data-testid^="withdrawal-status-"]').first();
    await expect(statusCell).toHaveText('На проверке');

    const withdrawalsResponse = await request.get(`${API_BASE}/wallet/withdrawals`, {
      headers: { Authorization: `Bearer ${sellerBody.accessToken}` },
    });
    const withdrawals = (await withdrawalsResponse.json()) as Array<{
      id: string;
      gatewayRef: string | null;
      netMinor: string;
      status: string;
    }>;
    const withdrawal = withdrawals[0];
    expect(withdrawal?.status).toBe('PENDING_REVIEW');

    const adminLogin = await request.post(`${API_BASE}/auth/mock-login`, {
      data: { role: 'ADMIN' },
    });
    const adminBody = (await adminLogin.json()) as { accessToken: string };

    const approveResponse = await request.post(
      `${API_BASE}/admin/withdrawals/${withdrawal.id}/approve`,
      {
        headers: { Authorization: `Bearer ${adminBody.accessToken}` },
      },
    );
    expect(approveResponse.ok()).toBeTruthy();
    const approved = (await approveResponse.json()) as { gatewayRef: string | null };
    expect(approved.gatewayRef).toBeTruthy();

    await simulateWithdrawalPaid(request, {
      withdrawalId: approved.gatewayRef!,
      amountMinor: Number(withdrawal.netMinor),
      externalUserId: sellerBody.user.id,
    });

    await page.reload();
    await expect(statusCell).toHaveText('Выплачено');
  });
});
