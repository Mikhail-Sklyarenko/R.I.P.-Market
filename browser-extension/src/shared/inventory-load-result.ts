import type { SteamInventoryItem } from '@rip-market/extension-orchestrator';
import { OfferErrorCode, type OfferErrorCodeType } from '@rip-market/extension-orchestrator';

export type InventoryFailReason =
  | 'not_logged_in'
  | 'private'
  | 'rate_limited'
  | 'unknown';

export type InventoryLoadResult = {
  items: SteamInventoryItem[];
  rateLimited: boolean;
  failReason?: InventoryFailReason | null;
  errorMessage?: string;
};

export function emptyInventoryLoadResult(
  failReason: InventoryFailReason | null = null,
  errorMessage?: string,
): InventoryLoadResult {
  return {
    items: [],
    rateLimited: failReason === 'rate_limited',
    failReason,
    errorMessage,
  };
}

export function isRateLimitedError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (/HTTP 429/.test(error.message) || /rate.?limit/i.test(error.message))
  );
}

export function isPrivateInventoryError(error: unknown): boolean {
  return (
    error instanceof Error && /inventory is private|success === 15|private/i.test(error.message)
  );
}

export function inventoryFailToOfferError(
  result: InventoryLoadResult,
): { code: OfferErrorCodeType; message: string } | null {
  if (result.items.length > 0) {
    return null;
  }
  switch (result.failReason) {
    case 'private':
      return {
        code: OfferErrorCode.INVENTORY_PRIVATE,
        message: result.errorMessage ?? 'Steam inventory is private',
      };
    case 'rate_limited':
      return {
        code: OfferErrorCode.INVENTORY_RATE_LIMITED,
        message:
          result.errorMessage ??
          'Steam inventory rate limited (HTTP 429). Wait 1–2 minutes and retry.',
      };
    case 'not_logged_in':
      return {
        code: OfferErrorCode.STEAM_COOKIE_EXPIRED,
        message:
          result.errorMessage ??
          'Seller is not logged into Steam in this browser',
      };
    default:
      if (result.rateLimited) {
        return {
          code: OfferErrorCode.INVENTORY_RATE_LIMITED,
          message:
            result.errorMessage ??
            'Steam inventory rate limited (HTTP 429). Wait 1–2 minutes and retry.',
        };
      }
      return null;
  }
}
