import { APIRequestContext } from '@playwright/test';
import { fundWallet } from './crypto-payments';

const API_BASE = process.env.PLAYWRIGHT_API_BASE_URL ?? 'http://localhost:3001/api/v1';

type InventoryAssetSeed = {
  id: string;
  itemDefinition: { weapon?: string | null; marketHashName: string };
};

function findAssetByWeapon(assets: InventoryAssetSeed[], weapon: string): InventoryAssetSeed {
  const match = assets.find(
    (asset) =>
      asset.itemDefinition.weapon === weapon ||
      asset.itemDefinition.marketHashName.includes(weapon),
  );
  if (!match) {
    throw new Error(`Inventory asset not found for weapon: ${weapon}`);
  }
  return match;
}

export async function seedActiveLot(request: APIRequestContext, priceMinor = 100_000) {
  const sellerLogin = await request.post(`${API_BASE}/auth/mock-login`, {
    data: { role: 'SELLER' },
  });
  const sellerBody = (await sellerLogin.json()) as { accessToken: string };
  const inventory = await request.get(`${API_BASE}/inventory`, {
    headers: { Authorization: `Bearer ${sellerBody.accessToken}` },
  });
  const assets = (await inventory.json()) as { assets: InventoryAssetSeed[] };
  const listableAsset = findAssetByWeapon(assets.assets, 'AK-47');
  const lotResponse = await request.post(`${API_BASE}/lots`, {
    headers: {
      Authorization: `Bearer ${sellerBody.accessToken}`,
      'Content-Type': 'application/json',
    },
    data: { inventoryAssetId: listableAsset.id, priceMinor },
  });
  const lot = (await lotResponse.json()) as { id: string };
  return { lotId: lot.id, priceMinor, sellerToken: sellerBody.accessToken };
}

const MOCK_TRADE_URL = 'https://steamcommunity.com/tradeoffer/new/?partner=123456789&token=AbCdEfGh';

export async function seedOpenOrder(
  request: APIRequestContext,
  priceMinor = 100_000,
) {
  const { lotId, priceMinor: price, sellerToken } = await seedActiveLot(request, priceMinor);

  const buyerLogin = await request.post(`${API_BASE}/auth/mock-login`, {
    data: { role: 'BUYER' },
  });
  const buyerBody = (await buyerLogin.json()) as { accessToken: string };

  await request.patch(`${API_BASE}/users/me/trade-url`, {
    headers: {
      Authorization: `Bearer ${buyerBody.accessToken}`,
      'Content-Type': 'application/json',
    },
    data: { tradeUrl: MOCK_TRADE_URL },
  });

  await request.patch(`${API_BASE}/users/me/trade-url`, {
    headers: {
      Authorization: `Bearer ${sellerToken}`,
      'Content-Type': 'application/json',
    },
    data: { tradeUrl: MOCK_TRADE_URL },
  });

  await fundWallet(request, buyerBody.accessToken, priceMinor * 2);

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

export async function seedCatalogLots(request: APIRequestContext) {
  const sellerLogin = await request.post(`${API_BASE}/auth/mock-login`, {
    data: { role: 'SELLER' },
  });
  const sellerBody = (await sellerLogin.json()) as { accessToken: string };
  const inventory = await request.get(`${API_BASE}/inventory`, {
    headers: { Authorization: `Bearer ${sellerBody.accessToken}` },
  });
  const assets = (await inventory.json()) as { assets: InventoryAssetSeed[] };
  const akAsset = findAssetByWeapon(assets.assets, 'AK-47');
  const awpAsset = findAssetByWeapon(assets.assets, 'AWP');

  async function createLot(assetId: string, priceMinor: number) {
    const lotResponse = await request.post(`${API_BASE}/lots`, {
      headers: {
        Authorization: `Bearer ${sellerBody.accessToken}`,
        'Content-Type': 'application/json',
      },
      data: { inventoryAssetId: assetId, priceMinor },
    });
    return (await lotResponse.json()) as { id: string };
  }

  const akLot = await createLot(akAsset.id, 100_000);
  const awpLot = await createLot(awpAsset.id, 150_000);

  return { akLotId: akLot.id, awpLotId: awpLot.id };
}

export async function seedSimilarLots(request: APIRequestContext) {
  const { lotId: sourceLotId } = await seedActiveLot(request);

  const extraSeller = await request.post(`${API_BASE}/test/extra-seller-session`);
  const extraBody = (await extraSeller.json()) as {
    ok: boolean;
    accessToken?: string;
  };
  if (!extraBody.ok || !extraBody.accessToken) {
    throw new Error('Failed to create extra seller session for similar lots seed');
  }

  const inventory = await request.get(`${API_BASE}/inventory`, {
    headers: { Authorization: `Bearer ${extraBody.accessToken}` },
  });
  const assets = (await inventory.json()) as { assets: InventoryAssetSeed[] };
  const akAsset = findAssetByWeapon(assets.assets, 'AK-47');

  const similarResponse = await request.post(`${API_BASE}/lots`, {
    headers: {
      Authorization: `Bearer ${extraBody.accessToken}`,
      'Content-Type': 'application/json',
    },
    data: { inventoryAssetId: akAsset.id, priceMinor: 120_000 },
  });
  const similarLot = (await similarResponse.json()) as { id: string };

  return { sourceLotId, similarLotId: similarLot.id };
}
