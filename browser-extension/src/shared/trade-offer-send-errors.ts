import { OfferErrorCode } from '@rip-market/extension-orchestrator';
import { normalizeSteamOfferId } from '@rip-market/extension-orchestrator';

export function mapSteamSendError(
  error: string,
  strError?: string,
): { code: string; message: string } {
  const combined = [error, strError].filter(Boolean).join(' — ');

  if (/session|login|not logged/i.test(combined)) {
    return { code: OfferErrorCode.INVENTORY_NOT_LOADED, message: combined };
  }
  if (/confirm|mobile|guard/i.test(combined)) {
    return { code: OfferErrorCode.STEAM_GUARD_REQUIRED, message: combined };
  }
  if (/escrow|hold|trade hold|cannot trade/i.test(combined)) {
    return { code: OfferErrorCode.TRADE_HOLD_BLOCKED, message: combined };
  }
  if (/item|asset|inventory|not found|missing/i.test(combined)) {
    return { code: OfferErrorCode.ITEM_MISSING, message: combined };
  }
  if (/private|inventory is private/i.test(combined)) {
    return { code: OfferErrorCode.INVENTORY_NOT_LOADED, message: combined };
  }
  if (/empty response|null response|invalid json|HTTP 400/i.test(combined)) {
    return {
      code: OfferErrorCode.STEAM_UNAVAILABLE,
      message:
        combined ||
        'Steam rejected the API send (often Trade Protected). Retry — extension will use UI autofill.',
    };
  }
  if (/content script|page script|trade page|jquery|UserYou/i.test(combined)) {
    return { code: OfferErrorCode.STEAM_UNAVAILABLE, message: combined };
  }

  return { code: OfferErrorCode.OFFER_SEND_FAILED, message: combined };
}

export function parseSteamSendResponse(parsed: {
  tradeofferid?: string | number;
  needs_mobile_confirmation?: boolean;
  strError?: string;
}): TradeOfferSendResultFromSteam {
  const strError = parsed.strError?.trim() ?? '';
  const normalizedOfferId = normalizeSteamOfferId(parsed.tradeofferid);
  if (strError && /confirm|mobile|guard/i.test(strError)) {
    return {
      ok: true,
      offerId: normalizedOfferId ?? '',
      confirmPending: true,
      strError,
    };
  }
  if (normalizedOfferId) {
    return {
      ok: true,
      offerId: normalizedOfferId,
      confirmPending: Boolean(parsed.needs_mobile_confirmation),
      strError: strError || undefined,
    };
  }
  if (strError) {
    return { ok: false, error: strError, strError };
  }
  return { ok: false, error: 'Offer send failed' };
}

type TradeOfferSendResultFromSteam =
  | { ok: true; offerId: string; confirmPending: boolean; strError?: string }
  | { ok: false; error: string; strError?: string };
