const OFFER_ID_PATTERN = /(?:tradeoffer\/|tradeofferid=)(\d+)/i;
const STEAM_OFFER_ID_PATTERN = /^\d{6,20}$/;

export function parseSteamTradeOfferId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }
  if (STEAM_OFFER_ID_PATTERN.test(trimmed)) {
    return trimmed;
  }

  const match = trimmed.match(OFFER_ID_PATTERN);
  return match?.[1] ?? null;
}

export function isValidSteamOfferId(offerId: string): boolean {
  return STEAM_OFFER_ID_PATTERN.test(offerId);
}
