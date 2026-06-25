export function calculateCommissionMinor(priceMinor: number): number {
  return Math.floor(priceMinor * 0.05);
}

export function calculateSellerReceiveMinor(priceMinor: number): number {
  return priceMinor - calculateCommissionMinor(priceMinor);
}

export function buildPricingPreview(priceMinor: number) {
  const commissionMinor = calculateCommissionMinor(priceMinor);
  return {
    priceMinor,
    commissionMinor,
    sellerReceiveMinor: priceMinor - commissionMinor,
  };
}
