import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  decodeSupportBridgePack,
  formatSupportBridgeTicketBody,
  parseSupportBridgeFromSearch,
  type SupportBridgePack,
} from './support-bridge-pack.ts';

function samplePack(): SupportBridgePack {
  return {
    version: 1,
    kind: 'extension_support',
    capturedAt: '2026-08-27T01:00:00.000Z',
    extensionVersion: '0.6.21',
    extensionId: 'ext',
    connected: true,
    steamMatch: true,
    sessionHealthCode: 'OK',
    errorCode: null,
    siteLinkMode: 'live',
    primaryOrderId: 'ord-1',
    deals: [
      {
        orderId: 'ord-1',
        orderShortId: 'ord-1',
        role: 'seller',
        orderStatus: 'WAITING_TRADE',
        phase: 'confirm_guard',
        offerId: '9',
        verificationStatus: 'verified',
        errorCode: null,
      },
    ],
  };
}

describe('support-bridge-pack (H6 website)', () => {
  it('decodes supportPack query and formats ticket body', () => {
    const json = JSON.stringify(samplePack());
    const bytes = new TextEncoder().encode(json);
    let binary = '';
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    const encoded = btoa(binary)
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replace(/=+$/g, '');

    const decoded = decodeSupportBridgePack(encoded);
    assert.equal(decoded?.primaryOrderId, 'ord-1');
    assert.equal(decoded?.deals[0]?.phase, 'confirm_guard');

    const fromSearch = parseSupportBridgeFromSearch(
      new URLSearchParams(`topic=extension&supportPack=${encoded}`),
    );
    assert.ok(fromSearch);
    assert.match(formatSupportBridgeTicketBody(fromSearch!), /confirm_guard/);
  });
});
