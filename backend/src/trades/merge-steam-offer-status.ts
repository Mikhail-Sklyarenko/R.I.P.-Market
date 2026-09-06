/**
 * Merge live GetTradeOffer status with Steam page observation from the extension.
 * Page "Trade Accepted" wins over lagging pending/unknown; terminal API decline/expire wins.
 */
export function mergeSteamOfferStatus(
  apiStatus: string | null | undefined,
  pageObservedStatus: string | null | undefined,
): string | null {
  const api = (apiStatus ?? '').toLowerCase() || null;
  const page = (pageObservedStatus ?? '').toLowerCase() || null;

  if (page === 'accepted') {
    if (api === 'declined' || api === 'expired') {
      return api;
    }
    return 'accepted';
  }

  return api;
}
