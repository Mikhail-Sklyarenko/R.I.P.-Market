type TradeOfferDraft = {
  buyerTradeUrl: string;
  item: {
    assetId: string;
    classId?: string;
    instanceId?: string;
    marketHashName?: string;
  };
};

type SendOfferPageResult =
  | { ok: true; offerId: string; confirmPending: boolean }
  | { ok: false; error: string };

export async function sendTradeOfferViaPageScript(
  tabId: number,
  draft: TradeOfferDraft,
): Promise<SendOfferPageResult> {
  // Legacy / emergency path: direct Steam tradeoffer/new/send POST.
  // Default send path is UI autofill when ENABLE_EXTENSION_UI_TRADE_FLOW is on.
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    args: [draft],
    func: async (offerDraft: TradeOfferDraft): Promise<SendOfferPageResult> => {
      const CS2_APP_ID = 730;
      const CS2_CONTEXT = 2;

      type SteamSendResponse = {
        tradeofferid?: string | number;
        needs_mobile_confirmation?: boolean;
        strError?: string;
      };

      function parseResponse(status: number, text: string): SendOfferPageResult {
        if (!text || text === 'null' || text.trim() === '') {
          return {
            ok: false,
            error: `Steam returned empty response (HTTP ${status})`,
          };
        }

        let parsed: SteamSendResponse | null = null;
        try {
          parsed = JSON.parse(text) as SteamSendResponse | null;
        } catch {
          return {
            ok: false,
            error: `Steam returned invalid JSON (HTTP ${status}): ${text.slice(0, 200)}`,
          };
        }

        if (!parsed || typeof parsed !== 'object') {
          return {
            ok: false,
            error: `Steam returned null response (HTTP ${status})`,
          };
        }

        const errorText = parsed.strError ?? '';
        if (errorText && /confirm|mobile|guard/i.test(errorText)) {
          return {
            ok: true,
            offerId: parsed.tradeofferid ? String(parsed.tradeofferid) : '',
            confirmPending: true,
          };
        }

        if (parsed.tradeofferid) {
          return {
            ok: true,
            offerId: String(parsed.tradeofferid),
            confirmPending: Boolean(parsed.needs_mobile_confirmation),
          };
        }

        if (/session|login/i.test(errorText)) {
          return {
            ok: false,
            error: errorText || 'Steam session expired — reload steamcommunity.com',
          };
        }

        return {
          ok: false,
          error: errorText || `Offer send failed (HTTP ${status})`,
        };
      }

      function getSessionId(): string | null {
        const match = document.cookie.match(/sessionid=([^;]+)/);
        return match?.[1] ?? null;
      }

      function parseTradeUrl(
        tradeUrl: string,
      ): { partner: string; token: string } | null {
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

      const sessionid = getSessionId();
      if (!sessionid) {
        return {
          ok: false,
          error: 'Steam session missing — open steamcommunity.com and log in',
        };
      }

      const tradeParams = parseTradeUrl(offerDraft.buyerTradeUrl);
      if (!tradeParams) {
        return { ok: false, error: 'Invalid buyer trade URL' };
      }

      const asset: Record<string, string | number> = {
        appid: CS2_APP_ID,
        contextid: String(CS2_CONTEXT),
        amount: 1,
        assetid: String(offerDraft.item.assetId),
      };
      if (offerDraft.item.classId) {
        asset.classid = String(offerDraft.item.classId);
      }
      if (offerDraft.item.instanceId) {
        asset.instanceid = String(offerDraft.item.instanceId);
      }

      const tradeOffer = {
        newversion: true,
        version: 2,
        me: {
          assets: [asset],
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

      try {
        const response = await fetch('https://steamcommunity.com/tradeoffer/new/send', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            Referer: offerDraft.buyerTradeUrl,
            Origin: 'https://steamcommunity.com',
          },
          body: form.toString(),
        });

        const text = await response.text();
        return parseResponse(response.status, text);
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : 'Offer send failed',
        };
      }
    },
  });

  const value = result?.result as SendOfferPageResult | undefined;
  if (!value) {
    return { ok: false, error: 'Script injection failed' };
  }
  return value;
}

export type { TradeOfferDraft };
