import { apiRequest, createIdempotencyKey } from './client';
import type {
  AdminLotCard,
  AdminLotsPage,
  AdminOrderCard,
  AdminOrderSummary,
  AdminUserCard,
  AdminUserSummary,
  DisputeResolution,
  ListAdminLotsParams,
  ListAdminOrdersParams,
  OutboxEvent,
  SettlementAllowlistEntry,
  SettlementAllowlistResponse,
} from './types';
import type { Order } from './types';

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

export function getAdminUsers(token: string) {
  return apiRequest<AdminUserSummary[]>('/admin/users', { token });
}

export function getAdminUser(token: string, userId: string) {
  return apiRequest<AdminUserCard>(`/admin/users/${userId}`, { token });
}

export function restrictAdminUser(
  token: string,
  userId: string,
  status: 'SELL_BLOCK' | 'BUY_BLOCK' | 'SUSPENDED',
  reason: string,
  idempotencyKey?: string,
) {
  return apiRequest<AdminUserCard>(`/admin/users/${userId}/restrict`, {
    method: 'POST',
    token,
    idempotencyKey: idempotencyKey ?? createIdempotencyKey('user-restrict'),
    body: { status, reason },
  });
}

export function unrestrictAdminUser(
  token: string,
  userId: string,
  reason: string,
  idempotencyKey?: string,
) {
  return apiRequest<AdminUserCard>(`/admin/users/${userId}/unrestrict`, {
    method: 'POST',
    token,
    idempotencyKey: idempotencyKey ?? createIdempotencyKey('user-unrestrict'),
    body: { reason },
  });
}

export function getAdminLots(token: string, params?: ListAdminLotsParams) {
  const query = buildQueryString({
    status: params?.status,
    sellerId: params?.sellerId,
    q: params?.q,
    page: params?.page,
    limit: params?.limit,
  });
  return apiRequest<AdminLotsPage>(`/admin/lots${query}`, { token });
}

export function getAdminLot(token: string, lotId: string) {
  return apiRequest<AdminLotCard>(`/admin/lots/${lotId}`, { token });
}

export function blockAdminLot(
  token: string,
  lotId: string,
  reason: string,
  idempotencyKey?: string,
) {
  return apiRequest<AdminLotCard>(`/admin/lots/${lotId}/block`, {
    method: 'POST',
    token,
    idempotencyKey: idempotencyKey ?? createIdempotencyKey('lot-block'),
    body: { reason },
  });
}

export function unblockAdminLot(
  token: string,
  lotId: string,
  reason: string,
  idempotencyKey?: string,
) {
  return apiRequest<AdminLotCard>(`/admin/lots/${lotId}/unblock`, {
    method: 'POST',
    token,
    idempotencyKey: idempotencyKey ?? createIdempotencyKey('lot-unblock'),
    body: { reason },
  });
}

export function cancelAdminLot(
  token: string,
  lotId: string,
  reason: string,
  idempotencyKey?: string,
) {
  return apiRequest<AdminLotCard>(`/admin/lots/${lotId}/cancel`, {
    method: 'POST',
    token,
    idempotencyKey: idempotencyKey ?? createIdempotencyKey('lot-cancel'),
    body: { reason },
  });
}

export function getAdminOrders(token: string, params?: ListAdminOrdersParams) {
  const query = buildQueryString({ status: params?.status });
  return apiRequest<AdminOrderSummary[]>(`/admin/orders${query}`, { token });
}

export function getAdminOrderCard(token: string, orderId: string) {
  return apiRequest<AdminOrderCard>(`/admin/orders/${orderId}`, { token });
}

export function applyObservedStatus(
  token: string,
  orderId: string,
  idempotencyKey?: string,
) {
  return apiRequest<AdminOrderCard>(`/admin/orders/${orderId}/apply-observed-status`, {
    method: 'POST',
    token,
    idempotencyKey: idempotencyKey ?? createIdempotencyKey('apply-observed'),
    body: {},
  });
}

export function getShadowMetrics(token: string) {
  return apiRequest<{ mismatchesLast7d: number }>('/admin/metrics/shadow', { token });
}

export function getSettlementAllowlist(token: string) {
  return apiRequest<SettlementAllowlistResponse>('/admin/settlement/allowlist', { token });
}

export function upsertSettlementAllowlist(
  token: string,
  steamId: string,
  body: { enabled?: boolean; maxOrderMinor?: string; note?: string },
) {
  return apiRequest<SettlementAllowlistEntry>(`/admin/settlement/allowlist/${steamId}`, {
    method: 'POST',
    token,
    body,
  });
}

export function deleteSettlementAllowlist(token: string, steamId: string) {
  return apiRequest<{ success: boolean }>(
    `/admin/settlement/allowlist/${steamId}/delete`,
    { method: 'POST', token, body: {} },
  );
}

export function retrySettlement(token: string, orderId: string, idempotencyKey?: string) {
  return apiRequest<AdminOrderCard>(`/admin/orders/${orderId}/retry-settlement`, {
    method: 'POST',
    token,
    idempotencyKey: idempotencyKey ?? createIdempotencyKey('retry-settlement'),
    body: {},
  });
}

export function openDispute(
  token: string,
  orderId: string,
  reason: string,
  idempotencyKey?: string,
) {
  return apiRequest<AdminOrderCard>(`/admin/orders/${orderId}/dispute`, {
    method: 'POST',
    token,
    idempotencyKey: idempotencyKey ?? createIdempotencyKey('dispute-open'),
    body: { reason },
  });
}

export function resolveDispute(
  token: string,
  orderId: string,
  resolution: DisputeResolution,
  reason: string,
  idempotencyKey?: string,
) {
  return apiRequest<AdminOrderCard>(`/admin/orders/${orderId}/resolve`, {
    method: 'POST',
    token,
    idempotencyKey: idempotencyKey ?? createIdempotencyKey('dispute-resolve'),
    body: { resolution, reason },
  });
}

export function getOutboxEvents(token: string, status?: string) {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  return apiRequest<OutboxEvent[]>(`/admin/outbox${query}`, { token });
}

export function retryOutboxEvent(token: string, eventId: string) {
  return apiRequest<OutboxEvent>(`/admin/outbox/${eventId}/retry`, {
    method: 'POST',
    token,
    body: {},
  });
}

export function processOutbox(token: string) {
  return apiRequest<{ processed: number; failed: number }>('/admin/outbox/process', {
    method: 'POST',
    token,
    body: {},
  });
}

export function mockTradeFail(
  token: string,
  orderId: string,
  mode: 'SAFE' | 'DISPUTE',
  idempotencyKey?: string,
) {
  return apiRequest<Order>(`/trades/${orderId}/mock-fail`, {
    method: 'POST',
    token,
    idempotencyKey: idempotencyKey ?? createIdempotencyKey(`trade-fail-${mode.toLowerCase()}`),
    body: { mode },
  });
}

export function mockTradeTimeout(token: string, orderId: string, idempotencyKey?: string) {
  return apiRequest<Order>(`/trades/${orderId}/mock-timeout`, {
    method: 'POST',
    token,
    idempotencyKey: idempotencyKey ?? createIdempotencyKey('trade-timeout'),
    body: {},
  });
}
