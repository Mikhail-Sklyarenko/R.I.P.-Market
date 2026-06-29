export type ApiErrorField = {
  field: string;
  message: string;
};

export type ApiErrorPayload = {
  code: string;
  message: string;
  statusCode: number;
  requestId: string | null;
  details?: Record<string, unknown>;
  fields?: ApiErrorField[];
};

export class ApiError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly requestId: string | null;
  readonly details?: Record<string, unknown>;
  readonly fields?: ApiErrorField[];

  constructor(payload: ApiErrorPayload) {
    super(payload.message);
    this.name = 'ApiError';
    this.code = payload.code;
    this.statusCode = payload.statusCode;
    this.requestId = payload.requestId;
    this.details = payload.details;
    this.fields = payload.fields;
  }
}

export type AuthConfig = {
  authProvider: 'mock' | 'steam';
  inventoryProvider: 'mock' | 'steam';
  tradeProvider: 'mock' | 'steam';
  steamLoginAvailable: boolean;
  mockLoginAvailable: boolean;
  mockTradeEnabled: boolean;
  mockDepositEnabled: boolean;
  tradeVerificationMode: string;
  enableRealSettlement: boolean;
  liveVerificationMode: boolean;
};

export type AuthUser = {
  id: string;
  username: string;
  role: string;
  status: string;
  steamId?: string | null;
};

export type AuthResponse = {
  accessToken: string;
  tokenType: string;
  user: AuthUser;
  provider: string;
};

export type ItemDefinition = {
  marketHashName: string;
  weapon?: string;
  rarity?: string;
  iconUrl?: string | null;
};

export type InventorySyncMeta = {
  lastSyncedAt: string;
  expiresAt: string;
  stale: boolean;
  cacheHit: boolean;
  status: string;
  itemCount: number;
  warning?: string | null;
  errorCode?: string | null;
};

export type InventoryResponse = {
  assets: InventoryAsset[];
  sync: InventorySyncMeta;
};

export type InventoryAsset = {
  id: string;
  status: string;
  tradable: boolean;
  tradeLockUntil?: string | null;
  wear?: string | null;
  floatValue?: string | null;
  paintSeed?: number | null;
  itemDefinition: ItemDefinition;
};

export type Lot = {
  id: string;
  sellerId?: string;
  status: string;
  priceMinor: string;
  commissionMinor: string;
  sellerReceiveMinor: string;
  createdAt: string;
  inventoryAsset: InventoryAsset;
};

export type PricingPreview = {
  priceMinor: number;
  commissionMinor: number;
  sellerReceiveMinor: number;
};

export type TradeOperation = {
  id: string;
  status: string;
  providerRef?: string | null;
  failReasonCode?: string | null;
  externalOfferId?: string | null;
  lastCheckedAt?: string | null;
  checkCount?: number;
  expectedAssetId?: string | null;
  verificationMode?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type OrderParty = {
  id: string;
  username: string;
  tradeUrl?: string | null;
};

export type TradePollEvent = {
  id: string;
  tradeOperationId: string;
  checkedAt: string;
  offerStatus?: string | null;
  outcome: string;
  strategy?: string | null;
  error?: string | null;
};

export type TradeVerificationSnapshot = {
  id: string;
  orderId: string;
  source: string;
  observedStatus: string;
  expectedStatus?: string | null;
  match: boolean;
  payload?: Record<string, unknown>;
  createdAt: string;
};

export type OrderStatusEvent = {
  id: string;
  orderId: string;
  fromStatus?: string | null;
  toStatus: string;
  actorUserId?: string | null;
  reason?: string | null;
  requestId?: string | null;
  createdAt: string;
};

export type Order = {
  id: string;
  lotId: string;
  buyerId: string;
  sellerId: string;
  status: string;
  amountMinor: string;
  holdAmountMinor: string;
  createdAt: string;
  lot: Lot;
  tradeOperation?: TradeOperation | null;
  hold?: { id: string; amountMinor: string } | null;
  buyer?: OrderParty;
  seller?: OrderParty;
  statusEvents?: OrderStatusEvent[];
};

export type LotsPage = {
  items: Lot[];
  page: number;
  limit: number;
  total: number;
};

export type ListLotsParams = {
  q?: string;
  minPriceMinor?: number;
  maxPriceMinor?: number;
  weapon?: string;
  rarity?: string;
  sort?: 'price_asc' | 'price_desc' | 'newest';
  page?: number;
  limit?: number;
};

export type ListMyOrdersParams = {
  role?: 'buyer' | 'seller';
  status?: string;
};

export type NotificationCategory = 'deals' | 'money' | 'system';

export type WalletAccount = {
  type: string;
  balanceMinor: string;
};

export type Wallet = {
  id: string;
  currency: string;
  accounts: WalletAccount[];
  summary: {
    availableMinor: string;
    holdMinor: string;
    frozenMinor: string;
    totalMinor: string;
  };
};

export type LedgerEntry = {
  id: string;
  type: string;
  amountMinor: string;
  createdAt: string;
  orderId?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type Notification = {
  id: string;
  eventType: string;
  title: string;
  message: string;
  readAt: string | null;
  createdAt: string;
  payload?: Record<string, unknown>;
};

export type AdminUserSummary = {
  id: string;
  username: string;
  role: string;
  status: string;
  steamId?: string | null;
  createdAt?: string;
  wallet?: Wallet | null;
  _count?: {
    lots: number;
    buyOrders: number;
    sellOrders: number;
  };
};

export type AdminUserCard = {
  user: AdminUserSummary;
  auditLogs: AuditLogEntry[];
  openOrderCount: number;
  isRestricted: boolean;
};

export type AdminLotSummary = Lot & {
  seller: { id: string; username: string; status: string };
};

export type AdminLotsPage = {
  items: AdminLotSummary[];
  page: number;
  limit: number;
  total: number;
};

export type AdminLotCard = {
  lot: AdminLotSummary & {
    seller: {
      id: string;
      username: string;
      role: string;
      status: string;
      steamId?: string | null;
    };
  };
  statusEvents: StatusEvent[];
  auditLogs: AuditLogEntry[];
};

export type ListAdminLotsParams = {
  status?: string;
  sellerId?: string;
  q?: string;
  page?: number;
  limit?: number;
};

export type ListAdminOrdersParams = {
  status?: string;
};

export type AdminOrderSummary = Order & {
  buyer: AdminUserSummary;
  seller: AdminUserSummary;
};

export type HoldDetails = {
  id: string;
  amountMinor: string;
  capturedMinor?: string;
  releasedMinor?: string;
};

export type AdminOrderDetails = Order & {
  buyer: AdminUserSummary;
  seller: AdminUserSummary;
  hold?: HoldDetails | null;
};

export type LedgerEntryDetails = LedgerEntry & {
  walletId?: string;
  orderId?: string | null;
};

export type AuditLogEntry = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  reason?: string | null;
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
  createdAt: string;
  actorUser?: { id: string; username: string; role: string } | null;
};

export type StatusEvent = {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  reason?: string | null;
  createdAt: string;
};

export type OutboxEvent = {
  id: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  status: string;
  retryCount: number;
  createdAt: string;
  processedAt?: string | null;
  payload?: Record<string, unknown>;
};

export type AdminOrderCard = {
  order: AdminOrderDetails;
  ledgerEntries: LedgerEntryDetails[];
  auditLogs: AuditLogEntry[];
  outboxEvents: OutboxEvent[];
  orderStatusEvents: StatusEvent[];
  lotStatusEvents: StatusEvent[];
  tradePollEvents?: TradePollEvent[];
  verificationSnapshots?: TradeVerificationSnapshot[];
  settlement?: SettlementStatus;
};

export type SettlementStatus =
  | { allowed: true }
  | { allowed: false; code: string; reason: string };

export type SettlementAllowlistEntry = {
  steamId: string;
  enabled: boolean;
  maxOrderMinor?: string | null;
  note?: string | null;
  createdAt: string;
};

export type SettlementAllowlistResponse = {
  envSteamIds: string[];
  entries: SettlementAllowlistEntry[];
};

export type SettlementEligibility = {
  realSettlementEnabled: boolean;
  steamId: string | null;
  allowlisted: boolean;
  bannerVisible: boolean;
};

export type DisputeResolution = 'BUYER' | 'SELLER';
