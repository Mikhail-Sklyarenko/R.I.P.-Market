export const TRADE_OFFER_BRIDGE_SOURCE = 'rip-market-trade-offer-bridge';
export const TRADE_OFFER_PAGE_SOURCE = 'rip-market-trade-offer-page';

export const STEAM_BRIDGE_MESSAGE = {
  RUN_AUTOFILL_FLOW: 'RUN_AUTOFILL_FLOW',
} as const;

export type TradeOfferDraftPayload = {
  buyerTradeUrl: string;
  item: {
    assetId: string;
    classId?: string;
    instanceId?: string;
    marketHashName?: string;
  };
  note?: string;
};

export type TradeOfferSendSuccess = {
  ok: true;
  offerId: string;
  confirmPending: boolean;
  strError?: string;
};

export type TradeOfferSendFailure = {
  ok: false;
  error: string;
  strError?: string;
};

export type TradeOfferSendResult = TradeOfferSendSuccess | TradeOfferSendFailure;

export type RunAutofillBridgeRequest = {
  source: typeof TRADE_OFFER_BRIDGE_SOURCE;
  type: typeof STEAM_BRIDGE_MESSAGE.RUN_AUTOFILL_FLOW;
  requestId: string;
  payload: TradeOfferDraftPayload;
};

export type RunAutofillPageResponse = {
  source: typeof TRADE_OFFER_PAGE_SOURCE;
  requestId: string;
  result: TradeOfferSendResult;
};

export type SteamBridgeRuntimeRequest = {
  type: typeof STEAM_BRIDGE_MESSAGE.RUN_AUTOFILL_FLOW;
  payload: TradeOfferDraftPayload;
};

export type SteamBridgeRuntimeResponse =
  | { ok: true; data: TradeOfferSendResult }
  | { ok: false; code?: string; message: string };
