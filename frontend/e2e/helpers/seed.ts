import { APIRequestContext } from '@playwright/test';

const API_BASE = process.env.PLAYWRIGHT_API_BASE_URL ?? 'http://localhost:3001/api/v1';

export async function seedActiveLot(request: APIRequestContext, priceMinor = 100_000) {
  const sellerLogin = await request.post(`${API_BASE}/auth/mock-login`, {
    data: { role: 'SELLER' },
  });
  const sellerBody = (await sellerLogin.json()) as { accessToken: string };
  const inventory = await request.get(`${API_BASE}/inventory`, {
    headers: { Authorization: `Bearer ${sellerBody.accessToken}` },
  });
  const assets = (await inventory.json()) as Array<{ id: string }>;
  const lotResponse = await request.post(`${API_BASE}/lots`, {
    headers: {
      Authorization: `Bearer ${sellerBody.accessToken}`,
      'Content-Type': 'application/json',
    },
    data: { inventoryAssetId: assets[0].id, priceMinor },
  });
  const lot = (await lotResponse.json()) as { id: string };
  return { lotId: lot.id, priceMinor, sellerToken: sellerBody.accessToken };
}

export async function seedOpenOrder(
  request: APIRequestContext,
  priceMinor = 100_000,
) {
  const { lotId, priceMinor: price, sellerToken } = await seedActiveLot(request, priceMinor);

  const buyerLogin = await request.post(`${API_BASE}/auth/mock-login`, {
    data: { role: 'BUYER' },
  });
  const buyerBody = (await buyerLogin.json()) as { accessToken: string };

  await request.post(`${API_BASE}/wallet/mock-deposit`, {
    headers: {
      Authorization: `Bearer ${buyerBody.accessToken}`,
      'Idempotency-Key': `seed-deposit-${lotId}`,
      'Content-Type': 'application/json',
    },
    data: { amountMinor: priceMinor * 2 },
  });

  const orderResponse = await request.post(`${API_BASE}/orders`, {
    headers: {
      Authorization: `Bearer ${buyerBody.accessToken}`,
      'Idempotency-Key': `seed-order-${lotId}`,
      'Content-Type': 'application/json',
    },
    data: { lotId },
  });
  const order = (await orderResponse.json()) as { id: string; status: string };

  return {
    lotId,
    orderId: order.id,
    priceMinor: price,
    sellerToken,
    buyerToken: buyerBody.accessToken,
  };
}
