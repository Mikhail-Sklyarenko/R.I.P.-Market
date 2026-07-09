import {
  isValidSteamOfferId,
  parseSteamTradeOfferId,
} from '../providers/trade/trade-offer.util';

export { isValidSteamOfferId, parseSteamTradeOfferId };

export function normalizeTradeReferenceInput(input: {
  offerId?: string | null;
  tradeUrl?: string | null;
}): string | null {
  if (input.offerId) {
    const fromId = parseSteamTradeOfferId(input.offerId);
    if (fromId) {
      return fromId;
    }
  }
  if (input.tradeUrl) {
    return parseSteamTradeOfferId(input.tradeUrl);
  }
  return null;
}
