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
};
