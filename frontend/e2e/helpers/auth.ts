import { Page, expect } from '@playwright/test';
import { fundWallet } from './crypto-payments';

const API_BASE = process.env.PLAYWRIGHT_API_BASE_URL ?? 'http://localhost:3001/api/v1';

export async function loginAsSeller(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Seller', exact: true }).click();
  await page.getByTestId('login-seller').click();
  await expect(page).toHaveURL(/\/sell\/inventory$/);
}

export async function loginAsBuyer(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Buyer', exact: true }).click();
  await page.getByTestId('login-buyer').click();
  await expect(page).toHaveURL(/\/catalog$/);
}

export async function loginAsAdmin(page: Page) {
  await page.goto('/login');
  await page.evaluate(() => localStorage.removeItem('rip_market_auth'));
  await page.goto('/login');
  await page.getByRole('button', { name: 'Admin', exact: true }).click();
  await page.getByTestId('login-admin').click();
  await expect(page).toHaveURL(/\/admin\/orders$/);
}

export async function openFirstCatalogLot(page: Page) {
  await page.getByTestId('catalog-open-lot').first().click();
}

export async function buyerPurchaseWaitingTrade(page: Page, depositAmountMinor = 200_000) {
  await openFirstCatalogLot(page);
  await page.getByTestId('buy-lot-button').click();
  await expect(page).toHaveURL(/\/checkout$/);

  const buyerLogin = await page.request.post(`${API_BASE}/auth/mock-login`, {
    data: { role: 'BUYER' },
  });
  const buyerBody = (await buyerLogin.json()) as { accessToken: string };
  await fundWallet(page.request, buyerBody.accessToken, depositAmountMinor);

  await page.reload();
  await page.getByTestId('confirm-purchase-button').click();
  await expect(page.getByTestId('order-status')).toHaveText('WAITING_TRADE');
}
