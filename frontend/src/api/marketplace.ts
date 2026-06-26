import { apiRequest, createIdempotencyKey } from './client';
import type {
  AuthConfig,
  AuthResponse,
  LedgerEntry,
  Lot,
  Notification,
  Order,
  PricingPreview,
  InventoryResponse,
  Wallet,
} from './types';

export { createIdempotencyKey };

export function getAuthConfig() {
  return apiRequest<AuthConfig>('/auth/config');
}

export function getAuthMe(token: string) {
  return apiRequest<AuthResponse['user']>('/auth/me', { token });
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

export function listActiveLots() {
  return apiRequest<Lot[]>('/lots');
}

export function getLot(lotId: string) {
  return apiRequest<Lot>(`/lots/${lotId}`);
}

export function getInventory(token: string, options?: { forceRefresh?: boolean }) {
  const query = options?.forceRefresh ? '?forceRefresh=true' : '';
  return apiRequest<InventoryResponse>(`/inventory${query}`, { token });
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

export function listMyOrders(token: string) {
  return apiRequest<Order[]>('/me/orders', { token });
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

export function cancelLot(token: string, lotId: string) {
  return apiRequest<Lot>(`/lots/${lotId}/cancel`, {
    method: 'POST',
    token,
    body: {},
  });
}

export function listNotifications(token: string, unreadOnly = false) {
  const query = unreadOnly ? '?unreadOnly=true' : '';
  return apiRequest<Notification[]>(`/me/notifications${query}`, { token });
}

export function markNotificationRead(token: string, notificationId: string) {
  return apiRequest<Notification>(`/me/notifications/${notificationId}/read`, {
    method: 'PATCH',
    token,
  });
}
