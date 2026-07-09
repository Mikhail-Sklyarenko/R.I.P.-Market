const STEAM_OFFER_ID_PATTERN = /^\d{6,20}$/;

export function isValidSteamOfferId(offerId: string): boolean {
  return STEAM_OFFER_ID_PATTERN.test(offerId.trim());
}

export function normalizeSteamOfferId(
  offerId: string | number | null | undefined,
): string | null {
  if (offerId === null || offerId === undefined) {
    return null;
  }
  const normalized = String(offerId).trim();
  return isValidSteamOfferId(normalized) ? normalized : null;
}
