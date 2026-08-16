/**
 * Steam market guide prices are sometimes wrong (stale scrape, wrong wear, $0.01).
 * Hide them when they would undermine purchase confidence next to the listing price.
 */
export function isCredibleSteamGuidePrice(
  steamPriceMinor: number | null | undefined,
  listingPriceMinor: number | string | null | undefined,
): boolean {
  if (steamPriceMinor == null || !Number.isFinite(steamPriceMinor) || steamPriceMinor <= 0) {
    return false;
  }

  const listing =
    typeof listingPriceMinor === 'string'
      ? Number(listingPriceMinor)
      : listingPriceMinor;

  if (listing == null || !Number.isFinite(listing) || listing <= 0) {
    return steamPriceMinor >= 50;
  }

  const ratio = steamPriceMinor / listing;
  return ratio >= 0.15 && ratio <= 4;
}
