export type TradeTaskExecutionPhase =
  | 'ACKED'
  | 'TRADE_PAGE_OPENED'
  | 'OFFER_DRAFTED'
  | 'ITEM_SELECTED'
  | 'OFFER_SUBMITTED'
  | 'CONFIRM_PENDING'
  | 'OFFER_SENT'
  | 'OFFER_FAILED';

export type CreateOfferTaskPayload = {
  orderId: string;
  tradeOperationId: string;
  sellerId: string;
  buyerId: string;
  expectedAssetId: string | null;
  marketHashName: string | null;
  buyerTradeUrl: string | null;
  inventoryAssetId: string;
  idempotencyKey: string;
  sellerSteamId?: string | null;
  uiTradeFlow?: boolean;
};

export type PolledTradeTask = {
  id: string;
  type: 'create_offer';
  orderId: string;
  tradeOperationId: string;
  idempotencyKey: string;
  executionPhase: TradeTaskExecutionPhase | null;
  payload: CreateOfferTaskPayload;
  expiresAt: string;
  attemptCount: number;
};

export type TaskProgressReport = {
  taskId: string;
  phase: TradeTaskExecutionPhase;
  idempotencyKey: string;
  reasonCode?: string;
  offerId?: string;
  details?: Record<string, unknown>;
};

export type SteamInventoryItem = {
  assetId: string;
  classId?: string;
  instanceId?: string;
  marketHashName?: string;
};

export type DraftOfferInput = {
  buyerTradeUrl: string;
  item: SteamInventoryItem;
  taskId?: string;
};

export type DraftOfferResult =
  | { ok: true; draftId: string }
  | { ok: false; code: string; message: string };

export type SendOfferResult =
  | { ok: true; offerId: string; confirmPending?: boolean }
  | { ok: false; code: string; message: string };

export type SendOfferHooks = {
  onItemSelected?: (details: {
    assetId: string;
    marketHashName?: string | null;
  }) => void | Promise<void>;
  onOfferSubmitted?: () => void | Promise<void>;
};
