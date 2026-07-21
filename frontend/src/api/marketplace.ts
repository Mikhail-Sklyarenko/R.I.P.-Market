import { apiRequest, createIdempotencyKey } from './client';
import type {
  AuthConfig,
  AuthResponse,
  LedgerEntry,
  ListLotsParams,
  ListMyOrdersParams,
  Lot,
  LotsPage,
  CatalogItem,
  CatalogItemsPage,
  BuyRequest,
  Notification,
  NotificationCategory,
  Order,
  PricingPreview,
  InventoryResponse,
  UserProfile,
  Wallet,
  WalletDepositInfo,
  WalletDepositStatus,
  WithdrawalRequest,
} from './types';

export { createIdempotencyKey };

export function getAuthConfig() {
  return apiRequest<AuthConfig>('/auth/config');
}

export function getAuthMe(token: string) {
  return apiRequest<AuthResponse['user']>('/auth/me', { token });
}

export function getUserMe(token: string) {
  return apiRequest<UserProfile>('/users/me', { token });
}

export function updateTradeUrl(token: string, tradeUrl: string) {
  return apiRequest<UserProfile>('/users/me/trade-url', {
    method: 'PATCH',
    token,
    body: { tradeUrl },
  });
}

export function unlinkSteam(token: string) {
  return apiRequest<UserProfile>('/users/me/steam', {
    method: 'DELETE',
    token,
  });
}

export function mockLogin(role: 'SELLER' | 'BUYER' | 'ADMIN') {
  return apiRequest<AuthResponse>('/auth/mock-login', {
    method: 'POST',
    body: { role },
  });
}

export function getSteamLoginUrl(returnUrl: string) {
  return apiRequest<{ url: string; provider: string }>(
    `/auth/steam/login-url?returnUrl=${encodeURIComponent(returnUrl)}`,
  );
}

export function getSteamLinkUrl(token: string) {
  return apiRequest<{ url: string; provider: string }>('/auth/steam/link-url', {
    token,
  });
}

function buildQueryString(
  params: Record<string, string | number | undefined>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      search.set(key, String(value));
    }
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

export function listActiveLots() {
  return apiRequest<Lot[]>('/lots');
}

export function listLots(params: ListLotsParams) {
  const query = buildQueryString({
    itemDefinitionId: params.itemDefinitionId,
    q: params.q,
    minPriceMinor: params.minPriceMinor,
    maxPriceMinor: params.maxPriceMinor,
    weapon: params.weapon,
    rarity: params.rarity,
    wear: params.wear,
    floatMin: params.floatMin,
    floatMax: params.floatMax,
    sort: params.sort,
    page: params.page,
    limit: params.limit,
  });
  return apiRequest<LotsPage>(`/lots${query}`);
}

export type ListCatalogItemsParams = {
  q?: string;
  weapon?: string;
  rarity?: string;
  wear?: string;
  stattrak?: 'only' | 'exclude';
  souvenir?: 'only' | 'exclude';
  floatMin?: number;
  floatMax?: number;
  minPriceMinor?: number;
  maxPriceMinor?: number;
  sort?: 'popular' | 'cheapest' | 'newest' | 'price_desc';
  page?: number;
  limit?: number;
};

export function listCatalogItems(params: ListCatalogItemsParams) {
  const query = buildQueryString({
    q: params.q,
    weapon: params.weapon,
    rarity: params.rarity,
    wear: params.wear,
    stattrak: params.stattrak,
    souvenir: params.souvenir,
    floatMin: params.floatMin,
    floatMax: params.floatMax,
    minPriceMinor: params.minPriceMinor,
    maxPriceMinor: params.maxPriceMinor,
    sort: params.sort,
    page: params.page,
    limit: params.limit,
  });
  return apiRequest<CatalogItemsPage>(`/catalog/items${query}`);
}

export function getCatalogItem(itemId: string) {
  return apiRequest<CatalogItem>(`/catalog/items/${itemId}`);
}

export function createBuyRequest(
  token: string,
  itemDefinitionId: string,
  options?: { maxPriceMinor?: number; wear?: string },
) {
  const body: { maxPriceMinor?: number; wear?: string } = {};
  if (options?.maxPriceMinor !== undefined) {
    body.maxPriceMinor = options.maxPriceMinor;
  }
  if (options?.wear) {
    body.wear = options.wear;
  }
  return apiRequest<BuyRequest>(`/buy-requests/items/${itemDefinitionId}`, {
    method: 'POST',
    token,
    body,
  });
}

export function listMyBuyRequests(token: string, itemDefinitionId?: string) {
  const query = itemDefinitionId
    ? `?itemDefinitionId=${encodeURIComponent(itemDefinitionId)}`
    : '';
  return apiRequest<BuyRequest[]>(`/buy-requests/mine${query}`, { token });
}

export function cancelBuyRequest(token: string, buyRequestId: string) {
  return apiRequest<BuyRequest>(`/buy-requests/${buyRequestId}`, {
    method: 'DELETE',
    token,
  });
}

export function listPopularCatalogItems(limit = 12) {
  return apiRequest<CatalogItem[]>(`/catalog/popular?limit=${limit}`);
}

export function getCatalogSteamPrices(
  marketHashNames: string[],
  options?: { cacheOnly?: boolean; forceRefresh?: boolean },
) {
  return apiRequest<{
    prices: Record<string, { priceMinor: number | null; fetchedAt?: string | null }>;
    steamPriceFetchedAt?: string | null;
  }>('/catalog/steam-prices', {
    method: 'POST',
    body: {
      marketHashNames,
      cacheOnly: options?.cacheOnly === true ? true : undefined,
      forceRefresh: options?.forceRefresh === true ? true : undefined,
    },
  });
}

export function listSimilarLots(lotId: string, limit = 6) {
  return apiRequest<Lot[]>(`/lots?similarTo=${encodeURIComponent(lotId)}&limit=${limit}`);
}

export function getLot(lotId: string) {
  return apiRequest<Lot>(`/lots/${lotId}`);
}

export function getInventory(token: string, options?: { forceRefresh?: boolean }) {
  const query = options?.forceRefresh ? '?forceRefresh=true' : '';
  return apiRequest<InventoryResponse>(`/inventory${query}`, { token });
}

export function getInventoryPriceHints(
  token: string,
  marketHashNames: string[],
  options?: { forceRefresh?: boolean; cacheOnly?: boolean },
) {
  return apiRequest<import('./types').InventoryPriceHintsResponse>('/inventory/price-hints', {
    method: 'POST',
    token,
    body: {
      marketHashNames,
      ...(options?.forceRefresh ? { forceRefresh: true } : {}),
      ...(options?.cacheOnly ? { cacheOnly: true } : {}),
    },
  });
}

export function checkInventoryAsset(token: string, assetId: string) {
  return apiRequest<InventoryResponse['assets'][number]>(`/inventory/${assetId}/check`, {
    method: 'POST',
    token,
  });
}

export function getMyLots(token: string) {
  return apiRequest<Lot[]>('/me/lots', { token });
}

export function getPricingPreview(priceMinor: number) {
  return apiRequest<PricingPreview>(`/lots/pricing-preview?priceMinor=${priceMinor}`);
}

export function createLot(token: string, inventoryAssetId: string, priceMinor: number) {
  return apiRequest<Lot>('/lots', {
    method: 'POST',
    token,
    body: { inventoryAssetId, priceMinor },
  });
}

export function createLotsBulk(
  token: string,
  inventoryAssetIds: string[],
  priceMinor: number,
) {
  return apiRequest<{
    lots: Lot[];
    createdCount: number;
    marketHashName: string;
  }>('/lots/bulk', {
    method: 'POST',
    token,
    body: { inventoryAssetIds, priceMinor },
  });
}

export function getWallet(token: string) {
  return apiRequest<Wallet>('/wallet', { token });
}

export function getWalletTransactions(token: string) {
  return apiRequest<LedgerEntry[]>('/wallet/transactions', { token });
}

export function mockDeposit(token: string, amountMinor: number, idempotencyKey?: string) {
  return apiRequest<{ wallet: Wallet }>('/wallet/mock-deposit', {
    method: 'POST',
    token,
    idempotencyKey: idempotencyKey ?? createIdempotencyKey('deposit'),
    body: { amountMinor },
  });
}

export function getWalletDeposit(token: string) {
  return apiRequest<WalletDepositInfo>('/wallet/deposit', { token });
}

export function getWalletDepositStatus(token: string) {
  return apiRequest<WalletDepositStatus>('/wallet/deposit/status', { token });
}

export function getWalletWithdrawals(token: string) {
  return apiRequest<WithdrawalRequest[]>('/wallet/withdrawals', { token });
}

export function createWalletWithdrawal(
  token: string,
  body: { toAddress: string; amountMinor: number },
  idempotencyKey?: string,
) {
  return apiRequest<WithdrawalRequest>('/wallet/withdrawals', {
    method: 'POST',
    token,
    idempotencyKey: idempotencyKey ?? createIdempotencyKey('withdrawal'),
    body,
  });
}

export function createOrder(token: string, lotId: string, idempotencyKey?: string) {
  return apiRequest<Order>('/orders', {
    method: 'POST',
    token,
    idempotencyKey: idempotencyKey ?? createIdempotencyKey('order'),
    body: { lotId },
  });
}

export function getOrder(token: string, orderId: string) {
  return apiRequest<Order>(`/orders/${orderId}`, { token });
}

export function checkOrderDelivery(token: string, orderId: string) {
  return apiRequest<{
    checked: boolean;
    transitioned: boolean;
    order: Order;
  }>(`/orders/${orderId}/check-delivery`, {
    method: 'POST',
    token,
    body: {},
  });
}

export type OrderTradeAcknowledgmentType =
  | 'SELLER_ACK_SENT'
  | 'BUYER_ACK_PRE_ACCEPT'
  | 'BUYER_ACK_RECEIVED';

export function acknowledgeOrderTrade(
  token: string,
  orderId: string,
  type: OrderTradeAcknowledgmentType,
) {
  return apiRequest<{
    ok: true;
    type: OrderTradeAcknowledgmentType;
    idempotent: boolean;
    order: Order;
  }>(`/orders/${orderId}/acknowledge`, {
    method: 'POST',
    token,
    body: { type },
  });
}

export function updateOrderTradeReference(
  token: string,
  orderId: string,
  body: { offerId?: string; tradeUrl?: string },
) {
  return apiRequest<Order>(`/orders/${orderId}/trade-reference`, {
    method: 'PATCH',
    token,
    body,
  });
}

export function listMyOrders(token: string, params?: ListMyOrdersParams) {
  const query = buildQueryString({
    role: params?.role,
    status: params?.status,
  });
  return apiRequest<Order[]>(`/me/orders${query}`, { token });
}

export function mockTradeSuccess(token: string, orderId: string, idempotencyKey?: string) {
  return apiRequest<Order>(`/trades/${orderId}/mock-success`, {
    method: 'POST',
    token,
    idempotencyKey: idempotencyKey ?? createIdempotencyKey('trade-success'),
    body: {},
  });
}

export function cancelOrder(token: string, orderId: string, idempotencyKey?: string) {
  return apiRequest<Order>(`/orders/${orderId}/cancel`, {
    method: 'POST',
    token,
    idempotencyKey: idempotencyKey ?? createIdempotencyKey('order-cancel'),
    body: {},
  });
}

export function updateLotPrice(token: string, lotId: string, priceMinor: number) {
  return apiRequest<Lot>(`/lots/${lotId}/price`, {
    method: 'PATCH',
    token,
    body: { priceMinor },
  });
}

export function cancelLot(token: string, lotId: string) {
  return apiRequest<Lot>(`/lots/${lotId}/cancel`, {
    method: 'POST',
    token,
    body: {},
  });
}

export function resetDevTrades(token: string) {
  return apiRequest<{
    ok: boolean;
    reason?: string;
    canceledOrders?: number;
    canceledLots?: number;
    resetAssets?: number;
    expiredTasks?: number;
  }>('/test/reset-dev-trades', {
    method: 'POST',
    token,
    body: {},
  });
}

export function listNotifications(
  token: string,
  options?: { unreadOnly?: boolean; category?: NotificationCategory },
) {
  const query = buildQueryString({
    unreadOnly: options?.unreadOnly ? 'true' : undefined,
    category: options?.category,
  });
  return apiRequest<Notification[]>(`/me/notifications${query}`, { token });
}

export function markNotificationRead(token: string, notificationId: string) {
  return apiRequest<Notification>(`/me/notifications/${notificationId}/read`, {
    method: 'PATCH',
    token,
  });
}

export function markAllNotificationsRead(token: string) {
  return apiRequest<{ success: boolean }>('/me/notifications/read-all', {
    method: 'PATCH',
    token,
  });
}

export function createSupportTicket(
  token: string,
  body: { subject: string; body: string },
) {
  return apiRequest<import('./types').SupportTicket>('/support/tickets', {
    method: 'POST',
    token,
    body,
  });
}

export function listMySupportTickets(token: string) {
  return apiRequest<import('./types').SupportTicket[]>('/support/tickets', { token });
}
