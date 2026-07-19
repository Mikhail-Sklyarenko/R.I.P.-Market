import type { Order } from '../api/types';
import { getOrderNextAction } from './order-flow.ts';
import { computeSellerPendingReceiveMinor } from './seller-flow.ts';

export { computeSellerPendingReceiveMinor };

export type OrderRole = 'buyer' | 'seller' | 'other';

export function getOrderRole(order: Order, userId?: string | null): OrderRole {
  if (!userId) {
    return 'other';
  }
  if (userId === order.buyerId) {
    return 'buyer';
  }
  if (userId === order.sellerId) {
    return 'seller';
  }
  return 'other';
}

export function formatOrderRoleLabel(role: OrderRole): string {
  if (role === 'buyer') {
    return 'Покупатель';
  }
  if (role === 'seller') {
    return 'Продавец';
  }
  return '—';
}

const ACTIVE_STATUSES = new Set([
  'CREATED',
  'PAYMENT_RESERVED',
  'WAITING_TRADE',
  'TRADE_CONFIRMED',
  'SETTLEMENT_HOLD',
]);

export function isActiveOrderStatus(status: string): boolean {
  return ACTIVE_STATUSES.has(status);
}

const TERMINAL_ORDER_STATUSES = new Set(['COMPLETED', 'CANCELED', 'FAILED']);

export function getDealNextStepShort(order: Order, role: OrderRole): string {
  // Avoid duplicating status text like «Сделка завершена» in the next-step column.
  if (TERMINAL_ORDER_STATUSES.has(order.status)) {
    return '—';
  }

  if (role === 'buyer' && order.status === 'WAITING_TRADE') {
    return 'Ожидается передача';
  }
  if (role === 'seller' && order.status === 'WAITING_TRADE') {
    return 'Передайте предмет';
  }

  const action = getOrderNextAction(order, role);
  return action?.title ?? '—';
}

export type OrderSummaryCounts = {
  active: number;
  waitingTrade: number;
  completed: number;
  review: number;
};

export function getOrderSummaryCounts(orders: Order[]): OrderSummaryCounts {
  return orders.reduce<OrderSummaryCounts>(
    (counts, order) => {
      if (isActiveOrderStatus(order.status)) {
        counts.active += 1;
      }
      if (order.status === 'WAITING_TRADE') {
        counts.waitingTrade += 1;
      }
      if (order.status === 'COMPLETED') {
        counts.completed += 1;
      }
      if (order.status === 'DISPUTE') {
        counts.review += 1;
      }
      return counts;
    },
    { active: 0, waitingTrade: 0, completed: 0, review: 0 },
  );
}

export type OrderRoleFilter = 'all' | 'buyer' | 'seller';
export type OrderStatusFilter = 'all' | 'active' | 'waiting' | 'completed' | 'review';

export function filterOrders(
  orders: Order[],
  userId: string | undefined,
  roleFilter: OrderRoleFilter,
  statusFilter: OrderStatusFilter,
): Order[] {
  return orders.filter((order) => {
    const role = getOrderRole(order, userId);

    if (roleFilter === 'buyer' && role !== 'buyer') {
      return false;
    }
    if (roleFilter === 'seller' && role !== 'seller') {
      return false;
    }

    if (statusFilter === 'active' && !isActiveOrderStatus(order.status)) {
      return false;
    }
    if (statusFilter === 'waiting' && order.status !== 'WAITING_TRADE') {
      return false;
    }
    if (statusFilter === 'completed' && order.status !== 'COMPLETED') {
      return false;
    }
    if (statusFilter === 'review' && order.status !== 'DISPUTE') {
      return false;
    }

    return true;
  });
}
