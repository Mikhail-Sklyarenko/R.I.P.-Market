import { apiRequest, createIdempotencyKey } from './client';
import type { AdminOrderCard, AdminOrderSummary, DisputeResolution, OutboxEvent } from './types';
import type { Order } from './types';

export function getAdminOrders(token: string) {
  return apiRequest<AdminOrderSummary[]>('/admin/orders', { token });
}

export function getAdminOrderCard(token: string, orderId: string) {
  return apiRequest<AdminOrderCard>(`/admin/orders/${orderId}`, { token });
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
