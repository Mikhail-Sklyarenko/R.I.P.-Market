import { describe, expect, it } from 'vitest';
import {
  buildSupportBridgePack,
  buildSupportBridgeUrl,
  decodeSupportBridgePack,
  encodeSupportBridgePack,
  formatSupportBridgeTicketBody,
  pickSupportBridgeDeals,
  resolveSteamMatch,
} from './support-bridge.js';

describe('support-bridge (H6)', () => {
  it('resolves steamMatch from session health', () => {
    expect(
      resolveSteamMatch({ connected: true, sessionHealthCode: 'OK' }),
    ).toBe(true);
    expect(
      resolveSteamMatch({
        connected: true,
        sessionHealthCode: 'STEAM_ACCOUNT_MISMATCH',
      }),
    ).toBe(false);
    expect(
      resolveSteamMatch({ connected: false, sessionHealthCode: 'OK' }),
    ).toBe(null);
  });

  it('ranks mismatch / report deals first and builds catalog fields', () => {
    const deals = pickSupportBridgeDeals([
      {
        orderId: 'wait-1',
        orderShortId: 'wait-1',
        role: 'buyer',
        orderStatus: 'WAITING_TRADE',
        nextAction: { kind: 'wait' },
        verificationStatus: 'pending',
      },
      {
        orderId: 'mis-1',
        orderShortId: 'mis-1xx',
        role: 'buyer',
        orderStatus: 'WAITING_TRADE',
        offerId: '99',
        nextAction: { kind: 'report_issue' },
        verificationStatus: 'mismatch',
        checks: [{ key: 'asset_id', passed: false }],
      },
    ]);
    expect(deals[0]?.orderId).toBe('mis-1');
    expect(deals[0]?.phase).toBe('report_issue');
    expect(deals[0]?.errorCode).toBe('VERIFY_MISMATCH');
  });

  it('builds pack with version / steamMatch / errorCode / primary order', () => {
    const pack = buildSupportBridgePack({
      extensionVersion: '0.6.21',
      extensionId: 'ext-id',
      connected: true,
      sessionHealthCode: 'INVENTORY_RATE_LIMITED',
      healthSupportCode: 'INVENTORY_RATE_LIMITED',
      siteLinkMode: 'live',
      trades: [
        {
          orderId: 'ord-1',
          orderShortId: 'ord-1abc',
          role: 'seller',
          orderStatus: 'WAITING_TRADE',
          nextAction: { kind: 'confirm_guard' },
          verificationStatus: 'verified',
        },
      ],
      capturedAt: '2026-08-27T01:00:00.000Z',
    });
    expect(pack.kind).toBe('extension_support');
    expect(pack.extensionVersion).toBe('0.6.21');
    expect(pack.steamMatch).toBe(true);
    expect(pack.errorCode).toBe('INVENTORY_RATE_LIMITED');
    expect(pack.primaryOrderId).toBe('ord-1');
    expect(pack.deals[0]?.phase).toBe('confirm_guard');
  });

  it('round-trips encode/decode and builds support URL', () => {
    const pack = buildSupportBridgePack({
      extensionVersion: '0.6.21',
      extensionId: 'ext',
      connected: true,
      sessionHealthCode: 'OK',
      trades: [
        {
          orderId: 'ord-42',
          role: 'buyer',
          orderStatus: 'WAITING_TRADE',
          offerId: 'offer-7',
          nextAction: { kind: 'accept_in_steam' },
          verificationStatus: 'verified',
        },
      ],
    });
    const encoded = encodeSupportBridgePack(pack);
    expect(decodeSupportBridgePack(encoded)?.primaryOrderId).toBe('ord-42');

    const url = buildSupportBridgeUrl({
      siteOrigin: 'https://p2pcs.ru',
      pack,
    });
    const parsed = new URL(url);
    expect(parsed.pathname).toBe('/support');
    expect(parsed.searchParams.get('topic')).toBe('extension');
    expect(parsed.searchParams.get('dealId')).toBe('ord-42');
    expect(parsed.searchParams.get('offerId')).toBe('offer-7');
    expect(parsed.searchParams.get('supportPack')).toBeTruthy();
  });

  it('formats a support-ready ticket body with catalog fields', () => {
    const body = formatSupportBridgeTicketBody(
      buildSupportBridgePack({
        extensionVersion: '0.6.21',
        extensionId: 'ext',
        connected: true,
        sessionHealthCode: 'STEAM_ACCOUNT_MISMATCH',
        trades: [],
      }),
    );
    expect(body).toMatch(/R\.I\.P extension support/);
    expect(body).toMatch(/steamMatch: no/);
    expect(body).toMatch(/extensionVersion: 0\.6\.21/);
  });
});
