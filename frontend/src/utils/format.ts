export function formatUsdFromMinor(minor: string | number): string {
  const value = typeof minor === 'string' ? Number(minor) : minor;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value / 100);
}

export function parseUsdToMinor(input: string): number | null {
  const normalized = input.replace(/[^0-9.]/g, '');
  if (!normalized) {
    return null;
  }
  const dollars = Number(normalized);
  if (!Number.isFinite(dollars) || dollars <= 0) {
    return null;
  }
  return Math.round(dollars * 100);
}

export function getErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: string }).message);
  }
  return fallback;
}

export const ERROR_MESSAGES: Record<string, string> = {
  INVENTORY_ASSET_NOT_AVAILABLE: 'This item is not available for listing.',
  INVENTORY_ASSET_NOT_TRADABLE: 'This item cannot be traded right now.',
  INVENTORY_ASSET_TRADE_LOCKED: 'This item is trade-locked.',
  LOT_ALREADY_EXISTS_FOR_ASSET: 'This item already has an active listing.',
  VALIDATION_ERROR: 'Please check the form and try again.',
  SELLER_NOT_ACTIVE: 'Your seller account is not active.',
  INSUFFICIENT_BALANCE: 'Not enough funds. Please deposit first.',
  LOT_NOT_ACTIVE: 'This listing is no longer available.',
  CANNOT_BUY_OWN_LOT: 'You cannot buy your own listing.',
  LOT_HAS_OPEN_ORDER: 'Someone else is already buying this lot.',
  BUYER_NOT_ACTIVE: 'Your buyer account is not active.',
  ORDER_NOT_FOUND: 'Order not found.',
  STEAM_AUTH_FAILED: 'Steam sign-in failed. Please try again.',
  STEAM_ALREADY_LINKED: 'This Steam account is already linked to another user.',
  STEAM_NOT_LINKED:
    'Link your Steam account on the Account page before syncing inventory.',
  STEAM_PROFILE_PRIVATE:
    'Your Steam inventory is private. Set it to public in Steam privacy settings.',
  INVENTORY_STALE: 'Could not refresh inventory from Steam. Try again shortly.',
  BAD_REQUEST: 'This action is not allowed right now.',
  FORBIDDEN: 'You do not have permission for this action.',
};

export const TRADE_STATUS_LABELS: Record<string, string> = {
  WAITING: 'Waiting for trade',
  CONFIRMED: 'Trade confirmed',
  FAILED_SAFE: 'Failed (refunded)',
  FAILED_DISPUTE: 'Failed (dispute)',
  TIMEOUT: 'Timed out',
};

export function formatTradeStatus(status?: string | null): string {
  if (!status) {
    return '—';
  }
  return TRADE_STATUS_LABELS[status] ?? status;
}

export const BUYER_CANCELABLE_STATUSES = new Set([
  'CREATED',
  'PAYMENT_RESERVED',
  'WAITING_TRADE',
]);

export function getHomePathForRole(role: string): string {
  if (role === 'SELLER') {
    return '/sell/inventory';
  }
  if (role === 'ADMIN') {
    return '/admin/orders';
  }
  return '/catalog';
}

export const OPEN_DISPUTE_STATUSES = new Set([
  'CREATED',
  'PAYMENT_RESERVED',
  'WAITING_TRADE',
  'TRADE_CONFIRMED',
]);

export const MOCK_TRADE_ENABLED =
  import.meta.env.VITE_ENABLE_MOCK_TRADE !== 'false';

export const IS_STAGING = import.meta.env.VITE_STAGING === 'true';

/** Mock trade / mock deposit UI — hidden on staging for non-admin users. */
export function canShowDevPanels(role?: string | null): boolean {
  if (!IS_STAGING) {
    return true;
  }
  return role === 'ADMIN';
}
