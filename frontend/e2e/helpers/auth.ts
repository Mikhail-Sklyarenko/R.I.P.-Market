import { Page, expect } from '@playwright/test';
import { fundWallet } from './crypto-payments';
import { prepareBuyerForPurchase, prepareUserForTrading } from './seed';

const API_BASE = process.env.PLAYWRIGHT_API_BASE_URL ?? 'http://localhost:3001/api/v1';

async function readPageToken(page: Page): Promise<string> {
  const token = await page.evaluate(() => {
    const raw = localStorage.getItem('rip_market_auth');
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as { token?: string };
    return parsed.token ?? null;
  });
  if (!token) {
    throw new Error('No auth token in localStorage after login');
  }
  return token;
}

async function loginAsMockRole(
  page: Page,
  role: 'SELLER' | 'BUYER',
  options?: { steamId?: string; gotoInventory?: boolean },
) {
  await page.goto('/login?dev=1');
  await page.getByRole('button', { name: role === 'SELLER' ? 'Seller' : 'Buyer', exact: true }).click();
  await page.getByTestId(`login-${role.toLowerCase()}`).click();
  await expect(page).toHaveURL(/\/catalog$/);
  const token = await readPageToken(page);
  if (role === 'SELLER') {
    await prepareUserForTrading(page.request, token, options?.steamId);
  } else {
    await prepareBuyerForPurchase(page.request, token);
  }
  await page.reload();
  await expect(page).toHaveURL(/\/catalog$/);
  if (options?.gotoInventory ?? role === 'SELLER') {
    await page.goto('/sell/inventory');
    await expect(page).toHaveURL(/\/sell\/inventory$/);
  }
}

export async function loginAsSeller(page: Page) {
  await loginAsMockRole(page, 'SELLER');
}

export async function loginAsBuyer(page: Page) {
  await loginAsMockRole(page, 'BUYER', { gotoInventory: false });
}

export async function loginAsAdmin(page: Page) {
  await page.goto('/login?dev=1');
  await page.evaluate(() => localStorage.removeItem('rip_market_auth'));
  await page.goto('/login?dev=1');
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
