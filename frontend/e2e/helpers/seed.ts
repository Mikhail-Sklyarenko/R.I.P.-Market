import { APIRequestContext } from '@playwright/test';
import { decodeUserIdFromToken, fundWallet, linkSteamForUser } from './crypto-payments';

const API_BASE = process.env.PLAYWRIGHT_API_BASE_URL ?? 'http://localhost:3001/api/v1';
const MOCK_TRADE_URL =
  'https://steamcommunity.com/tradeoffer/new/?partner=123456789&token=AbCdEfGh';
const MOCK_SELLER_STEAM_ID = '76561198000000000';

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

async function mockLogin(request: APIRequestContext, role: 'SELLER' | 'BUYER') {
  const response = await request.post(`${API_BASE}/auth/mock-login`, {
    data: { role },
  });
  if (!response.ok()) {
    throw new Error(`mock-login failed for ${role}: ${response.status()}`);
  }
  return (await response.json()) as { accessToken: string };
}

async function setTradeUrlForUser(request: APIRequestContext, accessToken: string) {
  const tradeUrlResponse = await request.patch(`${API_BASE}/users/me/trade-url`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    data: { tradeUrl: MOCK_TRADE_URL },
  });
  if (!tradeUrlResponse.ok()) {
    throw new Error(`trade-url update failed: ${tradeUrlResponse.status()}`);
  }
}

export async function prepareSellerForListing(
  request: APIRequestContext,
  accessToken: string,
  steamId = MOCK_SELLER_STEAM_ID,
) {
  const userId = decodeUserIdFromToken(accessToken);
  await setTradeUrlForUser(request, accessToken);
  await linkSteamForUser(request, userId, steamId);
}

export async function prepareBuyerForPurchase(
  request: APIRequestContext,
  accessToken: string,
) {
  await setTradeUrlForUser(request, accessToken);
}

async function createLot(
  request: APIRequestContext,
  accessToken: string,
  inventoryAssetId: string,
  priceMinor: number,
) {
  const lotResponse = await request.post(`${API_BASE}/lots`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    data: { inventoryAssetId, priceMinor },
  });
  if (!lotResponse.ok()) {
    throw new Error(
      `create lot failed: ${lotResponse.status()} ${await lotResponse.text()}`,
    );
  }
  return (await lotResponse.json()) as { id: string };
}

export async function seedActiveLot(request: APIRequestContext, priceMinor = 100_000) {
  const sellerBody = await mockLogin(request, 'SELLER');
  await prepareSellerForListing(request, sellerBody.accessToken);
  const inventory = await request.get(`${API_BASE}/inventory`, {
    headers: { Authorization: `Bearer ${sellerBody.accessToken}` },
  });
  const assets = (await inventory.json()) as { assets: InventoryAssetSeed[] };
  const listableAsset = findAssetByWeapon(assets.assets, 'AK-47');
  const lot = await createLot(
    request,
    sellerBody.accessToken,
    listableAsset.id,
    priceMinor,
  );
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

  await prepareBuyerForPurchase(request, buyerBody.accessToken);
  await setTradeUrlForUser(request, sellerToken);

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
  const sellerBody = await mockLogin(request, 'SELLER');
  await prepareSellerForListing(request, sellerBody.accessToken);
  const inventory = await request.get(`${API_BASE}/inventory`, {
    headers: { Authorization: `Bearer ${sellerBody.accessToken}` },
  });
  const assets = (await inventory.json()) as { assets: InventoryAssetSeed[] };
  const akAsset = findAssetByWeapon(assets.assets, 'AK-47');
  const awpAsset = findAssetByWeapon(assets.assets, 'AWP');

  const akLot = await createLot(request, sellerBody.accessToken, akAsset.id, 100_000);
  const awpLot = await createLot(request, sellerBody.accessToken, awpAsset.id, 150_000);

  return { akLotId: akLot.id, awpLotId: awpLot.id };
}

export async function seedStickerLot(request: APIRequestContext) {
  return seedActiveLot(request);
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

  await prepareSellerForListing(
    request,
    extraBody.accessToken,
    '76561198000000002',
  );

  const inventory = await request.get(`${API_BASE}/inventory`, {
    headers: { Authorization: `Bearer ${extraBody.accessToken}` },
  });
  const assets = (await inventory.json()) as { assets: InventoryAssetSeed[] };
  const akAsset = findAssetByWeapon(assets.assets, 'AK-47');

  const similarLot = await createLot(
    request,
    extraBody.accessToken,
    akAsset.id,
    120_000,
  );

  return { sourceLotId, similarLotId: similarLot.id };
}
