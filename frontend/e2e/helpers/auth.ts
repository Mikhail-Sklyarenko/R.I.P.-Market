import { Page, expect } from '@playwright/test';

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
  await page.reload();
  await page.getByRole('button', { name: 'Admin', exact: true }).click();
  await page.getByTestId('login-admin').click();
  await expect(page).toHaveURL(/\/admin\/orders$/);
}

export async function buyerPurchaseWaitingTrade(page: Page, depositAmount = '2000') {
  await page.getByRole('link', { name: 'View listing' }).first().click();
  await page.getByTestId('buy-lot-button').click();
  await expect(page).toHaveURL(/\/checkout$/);
  await page.getByTestId('checkout-deposit-link').click();
  await expect(page).toHaveURL(/\/wallet/);
  await page.getByTestId('deposit-amount-input').fill(depositAmount);
  await page.getByTestId('deposit-submit').click();
  await expect(page).toHaveURL(/\/checkout$/);
  await page.getByTestId('confirm-purchase-button').click();
  await expect(page.getByTestId('order-status')).toHaveText('WAITING_TRADE');
}
