import { apiRequest } from './client';
import type {
  AuthConfig,
  AuthResponse,
  InventoryAsset,
  Lot,
  PricingPreview,
} from './types';

export function getAuthConfig() {
  return apiRequest<AuthConfig>('/auth/config');
}

export function mockLogin(role: 'SELLER') {
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

export function getInventory(token: string) {
  return apiRequest<InventoryAsset[]>('/inventory', { token });
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
