/** DOM observations can trigger a server probe, but cannot attest delivery. */
export function mergeSteamOfferStatus(
  apiStatus: string | null | undefined,
  _pageObservedStatus: string | null | undefined,
): string | null {
  return (apiStatus ?? '').toLowerCase() || null;
}
