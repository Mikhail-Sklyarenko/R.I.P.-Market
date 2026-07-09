import { describe, expect, it } from 'vitest';
import { OfferErrorCode } from '@rip-market/extension-orchestrator';
import { mapSteamSendError, parseSteamSendResponse } from './trade-offer-send-errors.js';

describe('trade-offer-send-errors', () => {
  it('maps session errors', () => {
    expect(mapSteamSendError('Steam session expired')).toEqual({
      code: OfferErrorCode.INVENTORY_NOT_LOADED,
      message: 'Steam session expired',
    });
  });

  it('maps trade hold errors', () => {
    expect(mapSteamSendError('Offer send failed', 'You have a trade hold')).toEqual({
      code: OfferErrorCode.TRADE_HOLD_BLOCKED,
      message: 'Offer send failed — You have a trade hold',
    });
  });

  it('maps item errors', () => {
    expect(mapSteamSendError('Item 123 not found in trade inventory')).toEqual({
      code: OfferErrorCode.ITEM_MISSING,
      message: 'Item 123 not found in trade inventory',
    });
  });

  it('parses successful send response', () => {
    expect(
      parseSteamSendResponse({
        tradeofferid: '99887766',
        needs_mobile_confirmation: true,
      }),
    ).toEqual({
      ok: true,
      offerId: '99887766',
      confirmPending: true,
      strError: undefined,
    });
  });

  it('parses guard confirmation without invalid offer id as success without offer id', () => {
    expect(
      parseSteamSendResponse({
        strError: 'Please confirm this trade in your mobile app',
      }),
    ).toEqual({
      ok: true,
      offerId: '',
      confirmPending: true,
      strError: 'Please confirm this trade in your mobile app',
    });
  });

  it('rejects malformed offer ids from Steam response', () => {
    expect(
      parseSteamSendResponse({
        tradeofferid: 'pending-offer',
        needs_mobile_confirmation: false,
      }),
    ).toEqual({
      ok: false,
      error: 'Offer send failed',
    });
  });

  it('maps account mismatch style inventory errors', () => {
    expect(
      mapSteamSendError(
        'Logged-in Steam account does not match seller account',
      ),
    ).toEqual({
      code: OfferErrorCode.OFFER_SEND_FAILED,
      message: 'Logged-in Steam account does not match seller account',
    });
  });

  it('maps HTTP 429 inventory throttling', () => {
    expect(mapSteamSendError('HTTP 429 Too Many Requests')).toEqual({
      code: OfferErrorCode.OFFER_SEND_FAILED,
      message: 'HTTP 429 Too Many Requests',
    });
  });
});
