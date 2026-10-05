import {
  boundDeliveryProof,
  type ProofAnchors,
} from '../trades/durable-delivery-proof';
import { getSteamProtectionMs } from './settlement-hold.config';

/** A deadline is an absolute instant. Never parse timezone-less proof timestamps. */
export function proofDeadline(
  value: unknown,
  anchors: ProofAnchors,
): number | null {
  const proof = boundDeliveryProof(value, anchors);
  if (!proof) return null;
  if (
    proof.version === 3 &&
    (!anchors.tradeBinding || proof.bindingVerified !== true)
  )
    return null;
  const instant = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
  if (!instant.test(proof.verifiedAt) || !instant.test(proof.protectionUntil))
    return null;
  const verified = Date.parse(proof.verifiedAt);
  const until = Date.parse(proof.protectionUntil);
  if (
    new Date(verified).toISOString() !== proof.verifiedAt ||
    new Date(until).toISOString() !== proof.protectionUntil ||
    until - verified < getSteamProtectionMs()
  )
    return null;
  return until;
}

/** Historical v2 remains readable, but cannot opt into the proof-window risk policy. */
export function supportsProofWindow(
  value: unknown,
  anchors: ProofAnchors,
): boolean {
  const proof = boundDeliveryProof(value, anchors);
  return (
    !!proof &&
    proof.version === 3 &&
    proof.authority === 'STEAM_RECEIPT' &&
    proof.bindingVerified === true &&
    !!anchors.tradeBinding &&
    proofDeadline(value, anchors) !== null
  );
}

export function canonicalProtectionUntil(order: {
  id: string;
  seller?: { steamId?: string | null } | null;
  buyer?: { steamId?: string | null } | null;
  tradeOperation?: {
    deliveryProof?: unknown;
    externalOfferId?: string | null;
    expectedAssetId?: string | null;
    tradeBinding?: string | null;
  } | null;
}): string | null {
  const op = order.tradeOperation;
  const until = proofDeadline(op?.deliveryProof, {
    orderId: order.id,
    offerId: op?.externalOfferId ?? '',
    originalAssetId: op?.expectedAssetId ?? '',
    sellerSteamId: order.seller?.steamId ?? '',
    buyerSteamId: order.buyer?.steamId ?? '',
    tradeBinding: op?.tradeBinding,
  });
  return until === null ? null : new Date(until).toISOString();
}
