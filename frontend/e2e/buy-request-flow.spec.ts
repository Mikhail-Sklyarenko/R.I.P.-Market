import { expect, test } from '@playwright/test';
import { loginAsBuyer } from './helpers/auth';
import { fundWallet } from './helpers/crypto-payments';
import { resetDatabase } from './helpers/reset';
import { ensureMockCatalogSeeded } from './helpers/seed';

const API_BASE = process.env.PLAYWRIGHT_API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';

async function findCatalogItemWithoutOffers(request: Parameters<typeof resetDatabase>[0]) {
  const catalog = await request.get(`${API_BASE}/catalog/items?limit=50`);
  expect(catalog.ok()).toBeTruthy();
  const body = (await catalog.json()) as {
    items: Array<{
      id: string;
      activeLotCount: number;
      availableWears?: string[];
    }>;
  };
  const item = body.items.find((entry) => entry.activeLotCount === 0);
  expect(item).toBeTruthy();
  const wear = item!.availableWears?.[0];
  expect(wear).toBeTruthy();
  return { item: item!, wear: wear! };
}

test.describe('Buy request balance and quantity', () => {
  test.beforeEach(async ({ request }) => {
    await resetDatabase(request);
    await ensureMockCatalogSeeded(request);
  });

  test('reserves wallet balance and allows multiple prices per item', async ({ page, request }) => {
    const { item, wear } = await findCatalogItemWithoutOffers(request);

    const buyerLogin = await request.post(`${API_BASE}/auth/mock-login`, {
      data: { role: 'BUYER' },
    });
    const buyerToken = ((await buyerLogin.json()) as { accessToken: string }).accessToken;

    const insufficient = await request.post(`${API_BASE}/buy-requests/items/${item.id}`, {
      headers: { Authorization: `Bearer ${buyerToken}` },
      data: { maxPriceMinor: 1000, quantity: 1, wear },
    });
    expect(insufficient.status()).toBe(400);
    expect(((await insufficient.json()) as { error: { code: string } }).error.code).toBe(
      'INSUFFICIENT_BALANCE',
    );

    await fundWallet(request, buyerToken, 2500);

    const first = await request.post(`${API_BASE}/buy-requests/items/${item.id}`, {
      headers: { Authorization: `Bearer ${buyerToken}` },
      data: { maxPriceMinor: 1000, quantity: 2, wear },
    });
    expect(first.ok()).toBeTruthy();
    const firstBody = (await first.json()) as {
      id: string;
      reservedAmountMinor: string;
      quantity: number;
    };
    expect(firstBody.quantity).toBe(2);
    expect(firstBody.reservedAmountMinor).toBe('2000');

    const second = await request.post(`${API_BASE}/buy-requests/items/${item.id}`, {
      headers: { Authorization: `Bearer ${buyerToken}` },
      data: { maxPriceMinor: 500, quantity: 1, wear },
    });
    expect(second.ok()).toBeTruthy();

    const duplicate = await request.post(`${API_BASE}/buy-requests/items/${item.id}`, {
      headers: { Authorization: `Bearer ${buyerToken}` },
      data: { maxPriceMinor: 1000, quantity: 1, wear },
    });
    expect(duplicate.status()).toBe(400);

    await loginAsBuyer(page);
    await page.goto(`/catalog/items/${item.id}`);
    await expect(page.getByTestId('item-buy-request-active-list')).toBeVisible();
    await expect(page.getByTestId(`item-buy-request-active-${firstBody.id}`)).toBeVisible();
    await expect(page.getByTestId('item-buy-request-reserve-preview')).toBeVisible();

    await page.getByTestId(`item-buy-request-cancel-${firstBody.id}`).click();
    await expect(page.getByTestId(`item-buy-request-active-${firstBody.id}`)).toHaveCount(0);
  });
});
