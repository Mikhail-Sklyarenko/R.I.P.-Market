import { MIN_STEAM_PROTECTION_MS } from '../settlement/settlement-hold.config';

export const DELIVERY_VERSION = 3;
export const steamNumericId = (value: unknown): value is string =>
  typeof value === 'string' && /^[1-9][0-9]{0,19}$/.test(value);

export type ProofAnchors = {
  orderId: string;
  offerId: string;
  originalAssetId: string;
  sellerSteamId: string;
  buyerSteamId: string;
  tradeBinding?: string | null;
};
export type DurableDeliveryProof = {
  version: 2 | 3;
  orderId: string;
  offerId: string;
  tradeId: string;
  originalAssetId: string;
  sellerSteamId: string;
  buyerSteamId: string;
  receiptStatus: 3;
  offerState: 3;
  bindingVerified: boolean;
  tradeBinding?: string;
  authority?: 'STEAM_RECEIPT';
  verifiedAt: string;
  protectionUntil: string;
  destinationAssetId?: string;
  destinationContextId?: string;
  mappingMethod?: 'STEAM_RECEIPT' | 'INVENTORY_DELTA';
};

/** Validate persisted identity at every financial consumer, including legacy v2. */
export function boundDeliveryProof(
  value: unknown,
  anchors: ProofAnchors,
): DurableDeliveryProof | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const p = value as DurableDeliveryProof;
  if (
    (p.version !== 2 && p.version !== 3) ||
    p.orderId !== anchors.orderId ||
    p.offerId !== anchors.offerId ||
    p.originalAssetId !== anchors.originalAssetId ||
    p.sellerSteamId !== anchors.sellerSteamId ||
    p.buyerSteamId !== anchors.buyerSteamId ||
    !steamNumericId(p.tradeId) ||
    !steamNumericId(p.offerId) ||
    !steamNumericId(p.originalAssetId) ||
    !steamNumericId(p.sellerSteamId) ||
    !steamNumericId(p.buyerSteamId) ||
    p.sellerSteamId === p.buyerSteamId ||
    p.receiptStatus !== 3 ||
    p.offerState !== 3 ||
    (anchors.tradeBinding && p.bindingVerified !== true) ||
    (p.version === 3 &&
      p.tradeBinding !== (anchors.tradeBinding ?? undefined)) ||
    !Number.isFinite(Date.parse(p.verifiedAt)) ||
    !Number.isFinite(Date.parse(p.protectionUntil)) ||
    Date.parse(p.protectionUntil) - Date.parse(p.verifiedAt) <
      MIN_STEAM_PROTECTION_MS ||
    (p.version === 3 && p.authority !== 'STEAM_RECEIPT') ||
    (p.version === 2 &&
      (!steamNumericId(p.destinationAssetId) ||
        !['2', '16'].includes(p.destinationContextId ?? '') ||
        !['STEAM_RECEIPT', 'INVENTORY_DELTA'].includes(p.mappingMethod ?? '')))
  )
    return null;
  return p;
}
