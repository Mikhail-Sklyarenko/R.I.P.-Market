import {
  handleSteamBridgeRuntimeMessage,
} from './trade-offer-content-bridge.js';

const CS2_APP_ID = 730;
const CS2_CONTEXT = 2;

const OfferErrorCode = {
  ITEM_MISSING: 'ITEM_MISSING',
  OFFER_DRAFT_FAILED: 'OFFER_DRAFT_FAILED',
  STEAM_UNAVAILABLE: 'STEAM_UNAVAILABLE',
} as const;

type DraftPayload = {
  buyerTradeUrl: string;
  item: {
    assetId: string;
    classId?: string;
    instanceId?: string;
    marketHashName?: string;
  };
};

type DraftStore = {
  buyerTradeUrl: string;
  item: DraftPayload['item'];
};

type SteamInventoryItem = {
  assetId: string;
  classId?: string;
  instanceId?: string;
  marketHashName?: string;
};

const draftStore = new Map<string, DraftStore>();

function getSessionId(): string | null {
  const match = document.cookie.match(/sessionid=([^;]+)/);
  return match?.[1] ?? null;
}

function getSteamIdFromPage(): string | null {
  const win = window as unknown as Record<string, unknown>;
  const candidates = [
    win.g_steamID,
    (win.g_ActiveUser as { steamid?: string } | undefined)?.steamid,
    (win.g_rgWalletInfo as { steamid?: string } | undefined)?.steamid,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && /^\d{17}$/.test(candidate)) {
      return candidate;
    }
  }

  const profileMatch = window.location.href.match(/profiles\/(\d{17})/);
  if (profileMatch) {
    return profileMatch[1];
  }

  const miniProfile = document.querySelector('[data-miniprofile]');
  const miniProfileId = miniProfile?.getAttribute('data-miniprofile');
  if (miniProfileId && /^\d{17}$/.test(miniProfileId)) {
    return miniProfileId;
  }

  return null;
}

async function resolveSteamId(): Promise<string | null> {
  const fromPage = getSteamIdFromPage();
  if (fromPage) {
    return fromPage;
  }

  try {
    const response = await fetch('https://steamcommunity.com/my/profile/', {
      credentials: 'include',
      redirect: 'follow',
    });
    const profileMatch = response.url.match(/profiles\/(\d{17})/);
    if (profileMatch) {
      return profileMatch[1];
    }
  } catch {
    // Fall through to null.
  }

  return null;
}

function parseTradeUrl(tradeUrl: string): { partner: string; token: string } | null {
  try {
    const url = new URL(tradeUrl);
    const partner = url.searchParams.get('partner');
    const token = url.searchParams.get('token');
    if (!partner || !token) {
      return null;
    }
    return { partner, token };
  } catch {
    return null;
  }
}

type InventoryResponseBody = {
  success?: number;
  assets?: Array<{ assetid: string; classid: string; instanceid: string }>;
  descriptions?: Array<{
    classid: string;
    instanceid: string;
    market_hash_name?: string;
    tradable?: number;
  }>;
  total_inventory_count?: number;
  error?: string;
};

function parseInventoryBody(body: InventoryResponseBody): SteamInventoryItem[] {
  if (body.success === 0) {
    throw new Error(body.error ?? 'Steam inventory unavailable');
  }

  const descriptions = new Map<string, { marketHashName?: string; tradable?: number }>();
  for (const description of body.descriptions ?? []) {
    descriptions.set(`${description.classid}_${description.instanceid}`, {
      marketHashName: description.market_hash_name,
      tradable: description.tradable,
    });
  }

  return (body.assets ?? []).map((asset) => {
    const meta = descriptions.get(`${asset.classid}_${asset.instanceid}`);
    return {
      assetId: asset.assetid,
      classId: asset.classid,
      instanceId: asset.instanceid,
      marketHashName: meta?.marketHashName,
    };
  });
}

async function fetchInventory(steamId: string): Promise<SteamInventoryItem[]> {
  const merged = new Map<string, SteamInventoryItem>();
  let startAssetId: string | undefined;

  for (let page = 0; page < 20; page += 1) {
    const url = new URL(
      `https://steamcommunity.com/inventory/${steamId}/${CS2_APP_ID}/${CS2_CONTEXT}`,
    );
    url.searchParams.set('l', 'english');
    url.searchParams.set('count', '500');
    if (startAssetId) {
      url.searchParams.set('start_assetid', startAssetId);
    }

    const response = await fetch(url.toString(), { credentials: 'include' });
    if (!response.ok) {
      throw new Error(`Inventory HTTP ${response.status}`);
    }

    const body = (await response.json()) as InventoryResponseBody & {
      more_items?: number;
      last_assetid?: string;
    };
    for (const item of parseInventoryBody(body)) {
      merged.set(String(item.assetId), { ...item, assetId: String(item.assetId) });
    }

    if (!body.more_items || !body.last_assetid) {
      break;
    }
    startAssetId = body.last_assetid;
  }

  return [...merged.values()];
}

async function loadInventory(): Promise<SteamInventoryItem[]> {
  const steamId = await resolveSteamId();
  if (!steamId) {
    throw new Error('Steam ID not found — log in at steamcommunity.com');
  }
  return fetchInventory(steamId);
}

async function sendTradeOffer(draft: DraftStore): Promise<{
  offerId: string;
  confirmPending: boolean;
}> {
  const sessionid = getSessionId();
  if (!sessionid) {
    throw new Error('Steam session missing');
  }
  const tradeParams = parseTradeUrl(draft.buyerTradeUrl);
  if (!tradeParams) {
    throw new Error('Invalid buyer trade URL');
  }

  const tradeOffer = {
    newversion: true,
    version: 2,
    me: {
      assets: [
        {
          appid: CS2_APP_ID,
          contextid: String(CS2_CONTEXT),
          amount: 1,
          assetid: draft.item.assetId,
        },
      ],
      currency: [],
      ready: false,
    },
    them: { assets: [], currency: [], ready: false },
  };

  const form = new URLSearchParams();
  form.set('sessionid', sessionid);
  form.set('serverid', '1');
  form.set('partner', tradeParams.partner);
  form.set('tradeoffermessage', 'R.I.P Market trade');
  form.set('json_tradeoffer', JSON.stringify(tradeOffer));
  form.set(
    'trade_offer_create_params',
    JSON.stringify({ trade_offer_access_token: tradeParams.token }),
  );

  const response = await fetch('https://steamcommunity.com/tradeoffer/new/send', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    },
    body: form.toString(),
  });

  const text = await response.text();
  let parsed: { tradeofferid?: string; needs_mobile_confirmation?: boolean; strError?: string };
  try {
    parsed = JSON.parse(text) as typeof parsed;
  } catch {
    throw new Error('Steam returned invalid response');
  }

  if (!parsed.tradeofferid) {
    const errorText = parsed.strError ?? text.slice(0, 200);
    if (/confirm/i.test(errorText)) {
      return { offerId: 'pending-confirm', confirmPending: true };
    }
    throw new Error(errorText || 'Offer send failed');
  }

  return {
    offerId: String(parsed.tradeofferid),
    confirmPending: Boolean(parsed.needs_mobile_confirmation),
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  void (async () => {
    try {
      if (message.type === 'RUN_AUTOFILL_FLOW') {
        const response = await handleSteamBridgeRuntimeMessage(message);
        sendResponse(response);
        return;
      }

      if (message.type === 'STEAM_LOAD_INVENTORY') {
        const inventory = await loadInventory();
        sendResponse({ ok: true, data: inventory });
        return;
      }

      if (message.type === 'STEAM_DRAFT_OFFER') {
        const payload = message.payload as DraftPayload;
        const inventory = await loadInventory();
        const item = inventory.find(
          (entry) => String(entry.assetId) === String(payload.item.assetId),
        );
        if (!item) {
          sendResponse({
            ok: false,
            code: OfferErrorCode.ITEM_MISSING,
            message: 'Item not in inventory',
          });
          return;
        }
        const draftId = `draft-${item.assetId}`;
        draftStore.set(draftId, {
          buyerTradeUrl: payload.buyerTradeUrl,
          item,
        });
        sendResponse({ ok: true, data: { draftId } });
        return;
      }

      if (message.type === 'STEAM_SEND_OFFER') {
        const draftId = String((message.payload as { draftId: string }).draftId);
        const draft = draftStore.get(draftId);
        if (!draft) {
          sendResponse({
            ok: false,
            code: OfferErrorCode.OFFER_DRAFT_FAILED,
            message: 'Draft not found',
          });
          return;
        }
        const result = await sendTradeOffer(draft);
        draftStore.delete(draftId);
        sendResponse({ ok: true, data: result });
        return;
      }

      sendResponse({ ok: false, code: OfferErrorCode.STEAM_UNAVAILABLE, message: 'Unknown command' });
    } catch (error) {
      sendResponse({
        ok: false,
        code: OfferErrorCode.STEAM_UNAVAILABLE,
        message: error instanceof Error ? error.message : 'Steam error',
      });
    }
  })();
  return true;
});
