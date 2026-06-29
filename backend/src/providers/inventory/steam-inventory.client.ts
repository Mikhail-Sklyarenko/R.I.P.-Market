import {
  isPrivateInventoryResponse,
  SteamInventoryResponse,
} from './steam-inventory.parser';

export const STEAM_INVENTORY_BASE_URL = 'https://steamcommunity.com/inventory';

export type SteamInventoryFetchFn = (
  url: string,
) => Promise<{ status: number; body: SteamInventoryResponse }>;

async function defaultSteamInventoryFetch(
  url: string,
): Promise<{ status: number; body: SteamInventoryResponse }> {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'RIP-Market/1.0',
    },
  });

  let body: SteamInventoryResponse = {};
  try {
    const parsed = (await response.json()) as SteamInventoryResponse | null;
    body = parsed ?? {};
  } catch {
    body = {};
  }

  return { status: response.status, body };
}

export type FetchSteamInventoryPageOptions = {
  steamId: string;
  startAssetId?: string;
  count?: number;
  fetchFn?: SteamInventoryFetchFn;
};

export async function fetchSteamInventoryPage(
  options: FetchSteamInventoryPageOptions,
): Promise<SteamInventoryResponse> {
  const {
    steamId,
    startAssetId,
    count = 500,
    fetchFn = defaultSteamInventoryFetch,
  } = options;

  const url = new URL(`${STEAM_INVENTORY_BASE_URL}/${steamId}/730/2`);
  url.searchParams.set('l', 'english');
  url.searchParams.set('count', String(count));
  if (startAssetId) {
    url.searchParams.set('start_assetid', startAssetId);
  }

  const { status, body } = await fetchFn(url.toString());

  if (status >= 400) {
    if (isPrivateInventoryResponse(body, status)) {
      const error = new Error('Steam inventory is private');
      (error as Error & { code: string }).code = 'STEAM_PROFILE_PRIVATE';
      throw error;
    }
    throw new Error(`Steam inventory API returned ${status}`);
  }

  if (isPrivateInventoryResponse(body, status)) {
    const error = new Error('Steam inventory is private');
    (error as Error & { code: string }).code = 'STEAM_PROFILE_PRIVATE';
    throw error;
  }

  return body;
}

export async function fetchAllSteamInventoryPages(
  steamId: string,
  fetchFn?: SteamInventoryFetchFn,
): Promise<SteamInventoryResponse> {
  const merged: SteamInventoryResponse = {
    assets: [],
    descriptions: [],
    asset_properties: [],
    success: 1,
  };

  let startAssetId: string | undefined;
  let pageCount = 0;
  const maxPages = 20;

  while (pageCount < maxPages) {
    const page = await fetchSteamInventoryPage({
      steamId,
      startAssetId,
      fetchFn,
    });

    merged.assets?.push(...(page.assets ?? []));
    merged.descriptions?.push(...(page.descriptions ?? []));
    merged.asset_properties?.push(...(page.asset_properties ?? []));

    if (!page.more_items || !page.last_assetid) {
      merged.more_items = 0;
      break;
    }

    startAssetId = page.last_assetid;
    pageCount += 1;
  }

  if (pageCount >= maxPages && startAssetId) {
    merged.more_items = 1;
  }

  return merged;
}
