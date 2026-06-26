const OFFER_ID_PATTERN = /(?:tradeoffer\/|tradeofferid=)(\d+)/i;

export function parseSteamTradeOfferId(input: string): string | null {
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) {
    return trimmed;
  }

  const match = trimmed.match(OFFER_ID_PATTERN);
  return match?.[1] ?? null;
}
