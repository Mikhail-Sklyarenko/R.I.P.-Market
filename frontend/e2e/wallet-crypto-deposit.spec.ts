import { expect, test } from '@playwright/test';
import { loginAsBuyer } from './helpers/auth';
import { creditCryptoDeposit } from './helpers/crypto-payments';
import { resetDatabase } from './helpers/reset';
import { seedActiveLot } from './helpers/seed';

const API_BASE = process.env.PLAYWRIGHT_API_BASE_URL ?? 'http://localhost:3001/api/v1';

test.describe('Wallet crypto deposit', () => {
  test.beforeEach(async ({ request }) => {
    await resetDatabase(request);
  });

  test('shows USDT deposit UI and credits balance via webhook', async ({ page, request }) => {
    await loginAsBuyer(page);

    const loginResponse = await request.post(`${API_BASE}/auth/mock-login`, {
      data: { role: 'BUYER' },
    });
    const loginBody = (await loginResponse.json()) as {
      accessToken: string;
      user: { id: string };
    };

    await page.goto('/wallet');
    await expect(page.getByTestId('wallet-usdt-deposit')).toBeVisible();
    await expect(page.getByTestId('wallet-mock-deposit-form')).toHaveCount(0);
    await expect(page.getByTestId('deposit-warnings')).toBeVisible();
    await expect(page.getByTestId('deposit-trc20-address')).toBeVisible();
    await expect(page.getByTestId('deposit-awaiting-status')).toBeVisible();

    const address = await page.getByTestId('deposit-trc20-address').inputValue();
    expect(address).toMatch(/^T/);

    await creditCryptoDeposit(request, {
      token: loginBody.accessToken,
      userId: loginBody.user.id,
      amountMinor: 20_000,
      address,
    });

    await page.reload();
    await expect(page.getByTestId('wallet-available')).toContainText('$200.00');
  });

  test('checkout links to wallet when balance is insufficient', async ({ page, request }) => {
    const { lotId, priceMinor } = await seedActiveLot(request);

    await loginAsBuyer(page);
    await page.goto(`/lots/${lotId}/checkout`);

    await expect(page.getByTestId('purchase-insufficient-balance')).toBeVisible();
    await page.getByTestId('purchase-deposit-link').click();
    await expect(page).toHaveURL(/\/wallet/);
    await expect(page.getByTestId('deposit-needed-banner')).toContainText(
      new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(priceMinor / 100),
    );
  });
});
